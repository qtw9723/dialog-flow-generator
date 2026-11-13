import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { applyResultPatch, type ResultStore } from "../_shared/resultPatch.ts"
import { buildUploadRow } from "../../../src/lib/flow/buildUploadRow.js"
import { inspectUploadedBot } from "../../../src/lib/flow/inspectUploadedBot.js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

serve(async (req: Request) => {
  const T = tablePicker(isDevRequest(req.url))  // DEV 슬러그(-dev)면 dev_ 테이블 사용
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    // 업로드(POST)는 인증 가드보다 앞에 둔다 — master 관리자는 Supabase 세션 없이
    // adminToken으로만 로그인하므로(기존 admin-* 패턴: service_role + 클라이언트 게이트)
    // 세션이 없어도 올릴 수 있어야 한다. 세션이 있으면 소유자로 기록한다.
    if (req.method === "POST") {
      const postToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
      const { data: { user: poster } } = await supabase.auth.getUser(postToken)
      const body = await req.json().catch(() => null) as { generated_json?: unknown; name?: string; file_name?: string; sha256?: string } | null
      const json = body?.generated_json
      if (!json || typeof json !== "object") {
        return new Response(JSON.stringify({ error: "generated_json이 필요합니다." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }
      // 서버에서 다시 검사한다 — 프론트 검사만 믿으면 우회 저장으로 깨진 봇이 들어온다.
      const inspection = inspectUploadedBot(json)
      if (!inspection.ok) {
        return new Response(JSON.stringify({ error: "업로드할 수 없는 구조입니다.", blocking: inspection.blocking }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        })
      }
      const row = buildUploadRow(json, {
        name: body?.name,
        fileName: body?.file_name,
        sha256: body?.sha256,
        uploadedAt: new Date().toISOString(),
        info: inspection.info,
        ownerUserId: poster?.id || null,
        createdBy: poster?.email || "",
      })
      const { data, error } = await supabase.from(T("dialogflow_results")).insert(row).select("*").single()
      if (error) {
        console.error("[results] upload insert error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        })
      }
      console.log(`[results] uploaded bot ${data.id} — nodes ${inspection.info.nodeCount}, locked ${inspection.info.lockedCount}`)
      return new Response(JSON.stringify({ result: data, info: inspection.info }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 201,
      })
    }


    // 소유자 식별: 요청의 사용자 JWT로만 본인 결과에 접근. (전체 조회는 admin-results.)
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    const { data: { user: authUser } } = await supabase.auth.getUser(token)
    // GET/PATCH/DELETE는 본인 결과에만 접근하므로 사용자 세션이 필수다(아래 가드).
    if (!authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      })
    }

    if (req.method === "GET") {
      if (id) {
        const { data, error } = await supabase
          .from(T("dialogflow_results"))
          .select("*")
          .eq("id", id)
          .eq("user_id", authUser.id)
          .single()

        if (error) {
          console.error("[results] GET single error:", error)
          if (error.code === "PGRST116") {
            return new Response(JSON.stringify({ error: "Result not found" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 404,
            })
          }
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          })
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        })
      } else {
        const { data, error } = await supabase
          .from(T("dialogflow_results"))
          .select("*")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("[results] GET list error:", error)
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          })
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        })
      }
    }

    // 결과 갱신 — 분기 로직은 _shared/resultPatch.ts 한 벌뿐이다(admin-results와 공유).
    // 여기서 하는 일은 넷: id 확인 · 본문 파싱 · **소유자 필터를 건** 스토어 조립 · 응답 변환.
    // 어떤 분기를 탈지는 판단하지 않는다 — 그 판단이 두 벌이 되는 순간 복제가 다시 갈라진다.
    if (req.method === "PATCH") {
      if (!id) {
        return new Response(JSON.stringify({ error: "id query parameter is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      let body: any
      try { body = await req.json() } catch { body = {} }

      // 소유권은 오직 이 필터가 지킨다(id + user_id) — 모듈은 소유권을 모른다.
      const store: ResultStore = {
        id,
        logTag: "[results]",
        fetch: async (cols: string) => await supabase
          .from(T("dialogflow_results")).select(cols).eq("id", id).eq("user_id", authUser.id).single(),
        update: async (patch: Record<string, unknown>) => await supabase
          .from(T("dialogflow_results")).update(patch).eq("id", id).eq("user_id", authUser.id).select().single(),
      }

      const outcome = await applyResultPatch(body, store)
      if (outcome.kind === "error") {
        return new Response(JSON.stringify({ error: outcome.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: outcome.status,
        })
      }
      return new Response(JSON.stringify(outcome.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (req.method === "DELETE") {
      if (!id) {
        return new Response(JSON.stringify({ error: "id query parameter is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const { error } = await supabase
        .from(T("dialogflow_results"))
        .delete()
        .eq("id", id)
        .eq("user_id", authUser.id)

      if (error) {
        console.error("[results] DELETE error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[results] Error:", message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

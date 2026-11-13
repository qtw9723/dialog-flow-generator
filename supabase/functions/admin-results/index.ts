import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { applyResultPatch, type ResultStore } from "../_shared/resultPatch.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

// 관리자(master)용 전체 결과 조회/삭제. 기존 admin-* 패턴(service_role, 클라이언트 master 게이트 의존).
serve(async (req: Request) => {
  const T = tablePicker(isDevRequest(req.url))  // DEV 슬러그(-dev)면 dev_ 테이블 사용
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    if (req.method === "GET") {
      if (id) {
        const { data, error } = await supabase
          .from(T("dialogflow_results")).select("*").eq("id", id).single()
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: error.code === "PGRST116" ? 404 : 500,
          })
        }
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        })
      }
      const { data, error } = await supabase
        .from(T("dialogflow_results")).select("*").order("created_at", { ascending: false })
      if (error) {
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

    // 결과 갱신(관리자·master) — 분기 로직은 results와 **같은** _shared/resultPatch.ts를 쓴다.
    // 복제였던 시절 넷이나 갈라졌다(archived 없음, nlp 병합 없음, esd_error·api_error 없음,
    // undo의 세 키 복원 없음). 이제 유일한 차이는 아래 스토어의 필터뿐이다.
    if (req.method === "PATCH") {
      if (!id) {
        return new Response(JSON.stringify({ error: "id query parameter is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      let body: any
      try { body = await req.json() } catch { body = {} }

      // results와 유일하게 다른 곳 — 소유자 필터 없이 id로만 건다(마스터 관리자는 남의 결과를
      // 편집할 수 있다). 누가 여기까지 올 수 있는지는 기존 admin-* 게이트가 정한다.
      const store: ResultStore = {
        id,
        logTag: "[admin-results]",
        fetch: async (cols: string) => await supabase
          .from(T("dialogflow_results")).select(cols).eq("id", id).single(),
        update: async (patch: Record<string, unknown>) => await supabase
          .from(T("dialogflow_results")).update(patch).eq("id", id).select().single(),
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
      const { error } = await supabase.from(T("dialogflow_results")).delete().eq("id", id)
      if (error) {
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
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

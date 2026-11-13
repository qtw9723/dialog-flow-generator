import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}
const VALID_STATUS = ["pending", "approved", "blocked"]

// 관리자(master)용 테스터 목록/상태변경. 기존 admin-* 패턴(service_role, 클라이언트 master 게이트 의존).
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    if (req.method === "GET") {
      const status = url.searchParams.get("status")
      let q = supabase.from("testers").select("*").order("created_at", { ascending: false })
      if (status) q = q.eq("status", status)
      const { data, error } = await q
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }
      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    if (req.method === "PATCH") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing tester id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }
      const body = (await req.json()) as { status?: string }
      if (!body.status || !VALID_STATUS.includes(body.status)) {
        return new Response(
          JSON.stringify({ error: `status must be one of ${VALID_STATUS.join(", ")}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        )
      }
      const patch: Record<string, unknown> = { status: body.status }
      if (body.status === "approved") {
        patch.approved_at = new Date().toISOString()
        patch.approved_by = "master"
      }
      const { data, error } = await supabase
        .from("testers").update(patch).eq("id", id).select().single()
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

    if (req.method === "DELETE") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing tester id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }
      // testers 행만 제거(DialogFlow 목록에서 숨김). auth.users는 보존 — 이 Supabase는
      // notepad 등 다른 프로젝트와 공유하므로 auth 계정을 지우면 타 프로젝트 로그인이 깨진다.
      const { error } = await supabase.from("testers").delete().eq("id", id)
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

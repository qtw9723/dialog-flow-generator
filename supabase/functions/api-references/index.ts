import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { splitApiDefs } from "./lib/splitApiDefs.ts"
import { buildRequest } from "./lib/buildRequest.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status })

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    const action = url.searchParams.get("action")

    // API 실제 호출 테스트(서버 프록시 — 브라우저 CORS 회피). 저장 안 함.
    if (req.method === "POST" && action === "test") {
      const { api_def, paramValues } = await req.json().catch(() => ({}))
      if (!api_def || typeof api_def !== "object") return json({ error: "api_def가 필요합니다." }, 400)
      const spec = buildRequest(api_def, paramValues || {})
      try {
        const resp = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.body })
        const text = await resp.text()
        return json({ ok: resp.ok, status: resp.status, body: text.slice(0, 4000), request: { url: spec.url, method: spec.method } })
      } catch (e) {
        return json({ ok: false, status: 0, error: (e as Error).message, request: { url: spec.url, method: spec.method } })
      }
    }

    if (req.method === "GET") {
      const { data, error } = await supabase.from("dialogflow_api_references").select("*").order("name")
      if (error) return json({ error: error.message }, 500)
      return json(data || [])
    }

    // 생성: 단일 정의 또는 배열(HealthCare 형식) → 행들로 분할 삽입
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}))
      const payload = body?.api_def ?? body  // {api_def} 또는 정의 자체/배열 모두 허용
      const rows = splitApiDefs(payload)
      if (rows.length === 0) return json({ error: "유효한 API 정의(name 포함)가 없습니다." }, 400)
      const { data, error } = await supabase.from("dialogflow_api_references").insert(rows).select()
      if (error) return json({ error: error.message }, 500)
      return json({ inserted: data?.length || 0, rows: data }, 201)
    }

    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({}))
      const { id: bid, api_def } = body
      if (!bid || !api_def || typeof api_def !== "object") return json({ error: "id와 api_def가 필요합니다." }, 400)
      const patch: any = {
        api_def,
        name: typeof api_def.name === "string" ? api_def.name : undefined,
        description: typeof api_def.description === "string" ? api_def.description : undefined,
        method: typeof api_def.method === "string" ? api_def.method : undefined,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase.from("dialogflow_api_references").update(patch).eq("id", bid).select().single()
      if (error) return json({ error: error.message }, 500)
      return json(data)
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "id가 필요합니다." }, 400)
      const { error } = await supabase.from("dialogflow_api_references").delete().eq("id", id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: "Method not allowed" }, 405)
  } catch (err) {
    console.error("[api-references] error:", err)
    return json({ error: (err as Error).message || "Unexpected error" }, 500)
  }
})

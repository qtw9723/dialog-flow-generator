import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { validateAssetPayload } from "./validate.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  })

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    // -dev 슬러그(scenario-assets-dev)로 오면 dev_dialogflow_scenario_assets를 읽고 쓴다.
    const T = tablePicker(isDevRequest(req.url))
    const TABLE = T("dialogflow_scenario_assets")
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    const category = url.searchParams.get("category")

    // 호출자 이메일 — 등록자 기록과 삭제 권한 판정에 쓴다.
    // master 관리자는 Supabase 세션이 없어 null이다(기존 admin-* 패턴).
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    const { data: { user } } = await supabase.auth.getUser(token)
    const callerEmail = user?.email || null

    // 목록 (공개) — 라이브러리 화면이 레퍼런스와 함께 병합한다.
    if (req.method === "GET") {
      let q = supabase.from(TABLE).select("*").order("category").order("order_index")
      if (category) q = q.eq("category", category)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json(data || [])
    }

    // 등록 — 누구나. 승인 단계를 두지 않는다(확정 사항 3: 보관 표시가 이미 1차 필터다).
    if (req.method === "POST") {
      const body = await req.json().catch(() => null)
      const v = validateAssetPayload(body)
      if (!v.ok) return json({ error: v.error }, 400)
      const { data, error } = await supabase
        .from(TABLE)
        .insert([{ ...v.value, owner_email: callerEmail }])
        .select().single()
      if (error) return json({ error: error.message }, 500)
      return json(data, 201)
    }

    // 삭제 — 등록자 본인만. 이 저장소에는 서버측 관리자 토큰 검증이 없으므로
    // 관리자 삭제 경로를 새로 만들지 않는다(A단계 범위 밖).
    if (req.method === "DELETE") {
      if (!id) return json({ error: "id가 필요합니다." }, 400)
      if (!callerEmail) return json({ error: "Unauthorized" }, 401)
      const { data: row, error: readErr } = await supabase
        .from(TABLE).select("owner_email").eq("id", id).maybeSingle()
      if (readErr) return json({ error: readErr.message }, 500)
      if (!row) return json({ error: "자산을 찾을 수 없습니다." }, 404)
      if (row.owner_email !== callerEmail) return json({ error: "Forbidden" }, 403)
      const { error } = await supabase.from(TABLE).delete().eq("id", id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: "Method not allowed" }, 405)
  } catch (err) {
    console.error("[scenario-assets] error:", err)
    return json({ error: (err as Error).message || "Unexpected error" }, 500)
  }
})

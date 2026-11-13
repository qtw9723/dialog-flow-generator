// derive-assets — 업로드한 기존 챗봇에서 자산을 사후 파생한다 (v0.9.0).
//
// 입력: { result_id, kind: 'nlp' | 'esd' }
// 동작: 결과의 generated_json에서 파생 → generation_tiers에 **병합**하고 저장.
// ⚠ generated_json은 절대 쓰지 않는다 — v0.9.0의 왕복 무손실 불변식.
//
// 📄 'api'는 지원하지 않는다: deriveApiDefs는 설문 응답(연동 목적·보낼 정보)을 입력으로
//    받는데 업로드 봇에는 그 응답이 없다. flow의 api 노드만으로는 정의를 복원할 수 없다.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { deriveNlpData } from "../_shared/deriveNlpData.ts"
import { deriveEsdSchemas } from "../dialogflow-generator/flow/deriveEsdSchemas.ts"
import { flowToScenarios } from "../../../src/lib/flow/flowToScenarios.js"
import { mergeBundle } from "../../../src/lib/resultBundle/buildBundle.js"
import { llmErrorMessage } from "../_shared/llmError.ts"
import { LLM_MODEL } from "../_shared/llmModel.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status })

serve(async (req: Request) => {
  const T = tablePicker(isDevRequest(req.url))
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "POST만 지원합니다." }, 405)

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    // master 관리자는 Supabase 세션 없이 adminToken으로 로그인한다(기존 admin-* 패턴).
    // 세션이 있으면 본인 결과만, 없으면 소유자 없는 결과(관리자가 올린 것)만 다룬다.
    const { data: { user: authUser } } = await supabase.auth.getUser(token)

    const body = await req.json().catch(() => null) as { result_id?: string; kind?: string } | null
    const resultId = body?.result_id
    const kind = body?.kind
    if (!resultId) return json({ error: "result_id가 필요합니다." }, 400)
    if (kind !== "nlp" && kind !== "esd") return json({ error: "kind는 'nlp' 또는 'esd'만 지원합니다." }, 400)

    const { data: row, error: readErr } = await supabase
      .from(T("dialogflow_results")).select("*").eq("id", resultId).single()
    if (readErr || !row) return json({ error: "결과를 찾을 수 없습니다." }, 404)
    if (row.user_id && row.user_id !== authUser?.id) return json({ error: "본인 결과만 파생할 수 있습니다." }, 403)
    // 조립물(라이브러리 자산 조립 결과)은 등록된 자산을 이미 들고 있다 — 역파생하면 병합된
    // ESD/인텐트/엔티티를 LLM 재파생본으로 덮어써서, `assembly.items`가 가리키는 출처와
    // 실제 자산이 어긋난다. 화면에서도 감추지만(ResultDetail) 서버에서 막아야 실효가 있다.
    // 판정은 isAssembledResult(src/lib/resultEditGating.js)와 같다 — reference_id 없음 + assembly 키.
    if (row.reference_id == null && row.generation_tiers?.assembly) {
      return json({ error: "조립한 결과는 등록된 자산을 이미 들고 있어 다시 파생할 수 없습니다." }, 409)
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) return json({ error: "OPENAI_API_KEY가 설정돼 있지 않습니다." }, 500)
    const callLlm = async (prompt: string): Promise<string> => {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
        body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
      })
      if (!resp.ok) throw new Error(llmErrorMessage(resp.status, await resp.text().catch(() => "")))
      const data = await resp.json()
      return data.choices?.[0]?.message?.content || ""
    }

    const flow = row.generated_json
    let tiers = { ...(row.generation_tiers || {}) }
    let summary: Record<string, unknown> = {}

    if (kind === "nlp") {
      const scenarios = (flowToScenarios as any)(flow, { scenarioNames: tiers.scenarios })
      if (!scenarios.length) return json({ error: "시나리오를 찾지 못했습니다(main.then이 비었을 수 있습니다)." }, 422)
      const esdForPrompt = Array.isArray(tiers.esd_schemas) ? tiers.esd_schemas : []
      const nlp = await deriveNlpData(scenarios, esdForPrompt, callLlm)
      // 계약 경유(v0.10.0) — undefined는 삭제를 뜻한다(기존 delete tiers.nlp_error).
      tiers = (mergeBundle as any)(tiers, { nlp, nlp_error: undefined })
      summary = {
        intents: nlp.intents.length,
        utterances: nlp.intents.reduce((n, i) => n + i.examples.length, 0),
        entities: nlp.entities.length,
      }
    } else {
      const schemas = await deriveEsdSchemas(flow, callLlm, new Date().toISOString())
      tiers = (mergeBundle as any)(tiers, { esd_schemas: schemas })
      summary = { schemas: schemas.length }
    }

    // ⚠ generated_json은 넘기지 않는다 — 원본 불변.
    const { data: updated, error: writeErr } = await supabase
      .from(T("dialogflow_results")).update({ generation_tiers: tiers }).eq("id", resultId).select("*").single()
    if (writeErr) return json({ error: writeErr.message }, 500)

    console.log(`[derive-assets] ${kind} for ${resultId}: ${JSON.stringify(summary)}`)
    return json({ result: updated, kind, summary })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[derive-assets] error:", msg)
    return json({ error: msg }, 500)
  }
})

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { collectNodes, extractByType } from "./lib/extract.ts"
import { generalizeToSpecs } from "./lib/generalize.ts"
import { verifySpecs } from "./lib/verify.ts"
import { callOpenAiChat } from "../_shared/llmCall.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status })

  // ⚠ catch에서 상태 롤백에 쓰기 위해 try 바깥으로 끌어올린다 (2026-09-28).
  let reference_id: string | undefined
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!)
  // ⚠ 상태 롤백(→"failed") 자체가 실패해도(네트워크 오류 등) 원래 응답(원래 오류 메시지)을
  //    가리면 안 된다. 실패는 console.error로만 남기고 삼킨다 — try 안 세 분기(422·500·500)와
  //    최상위 catch까지 네 곳에서 반복되던 패턴이라 하나로 묶는다(2026-09-28 리뷰 반영).
  const markFailed = (id: string) =>
    supabase.from("dialogflow_references")
      .update({ basic_rules_status: "failed" }).eq("id", id)
      .then(undefined, (e: unknown) => console.error("[derive-node-specs] status rollback failed:", e))
  try {
    ;({ reference_id } = await req.json())
    if (!reference_id) return json({ error: "reference_id is required" }, 400)

    const { data: ref, error: refErr } = await supabase
      .from("dialogflow_references").select("id, json_data").eq("id", reference_id).single()
    if (refErr || !ref?.json_data) return json({ error: "Reference not found or has no json_data" }, 404)

    await supabase.from("dialogflow_references").update({ basic_rules_status: "extracting" }).eq("id", reference_id)

    // 1) 결정론적 추출
    const nodes = collectNodes(ref.json_data)
    const extract = extractByType(nodes)
    if (Object.keys(extract).length === 0) {
      await markFailed(reference_id)
      return json({ error: "추출된 노드가 없음 (json_data 구조 확인 필요)" }, 422)
    }

    // 설명: 레퍼런스 노드에 박힌 description만 사용 (전역 features 의존 제거)
    const descriptionsByType: Record<string, string> = {}
    for (const type of Object.keys(extract)) {
      descriptionsByType[type] = extract[type].description || ""
    }

    // 2) LLM 일반화 (레퍼런스당 1콜)
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      // ⚠ 여기도 :30에서 "extracting"으로 바꾼 뒤라 되돌리지 않으면 스피너가 멈추지 않는다.
      await markFailed(reference_id)
      return json({ error: "OPENAI_API_KEY not configured" }, 500)
    }
    const callLlm = (prompt: string) =>
      callOpenAiChat({ apiKey: openaiApiKey, prompt, temperature: 0.1 })
    const rawSpecs = await generalizeToSpecs({ extract, descriptionsByType, callLlm })

    // 3) 결정론적 검증 (closed-world)
    const { specs, warnings } = verifySpecs(rawSpecs, extract)

    // 4) 저장 (basic_rules 재사용, 무DDL)
    const basicRules = { version: "nodespecs-1", nodeSpecs: specs, extractedAt: new Date().toISOString(), warnings }
    const { error: upErr } = await supabase.from("dialogflow_references")
      .update({ basic_rules: basicRules, basic_rules_status: "completed", basic_rules_version: "nodespecs-1" })
      .eq("id", reference_id)
    if (upErr) {
      await markFailed(reference_id)
      return json({ error: (upErr as any).message || JSON.stringify(upErr) }, 500)
    }

    return json({ reference_id, node_types: specs.map((s) => s.type), spec_count: specs.length, warnings }, 200)
  } catch (error) {
    const msg = error instanceof Error ? error.message
      : (error && typeof error === "object" ? ((error as any).message || JSON.stringify(error)) : String(error))
    console.error("[derive-node-specs] Error:", msg)
    // ⚠ :30에서 status를 "extracting"으로 바꿔 놓았다. 여기서 되돌리지 않으면
    //    어드민 화면의 스피너가 영구히 멈추지 않는다(2026-09-28 실측).
    if (reference_id) {
      await markFailed(reference_id)
    }
    return json({ error: msg }, 500)
  }
})

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { buildApiExtractionPrompt, normalizeApiDefs } from "../../../src/lib/apiDoc/parseApiDocResponse.ts"
import { callOpenAiChat } from "../_shared/llmCall.ts"

// api-doc-parse: 자유형식 API 문서 텍스트 → api_def[] (LLM 추출).
// OpenAPI 3.x는 프론트에서 결정론 파서(apiDocToDef)로 처리하고, 그 외 문서(PDF·엑셀·자유 텍스트)만 이 함수로 온다.
// nl-scenario-parse와 동일 파이프라인 — 순수 로직(프롬프트·정규화)은 src/lib/apiDoc에서 재사용(중복 금지).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { text } = await req.json() as { text?: string }

    if (!text || typeof text !== "string" || text.trim() === "") {
      return new Response(
        JSON.stringify({ error: "text 필드가 필요합니다 (비어있지 않은 문자열)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // HTTP 오류·잘린 응답은 callOpenAiChat이 던진다 — 아래 최상위 catch가 500으로 내려보낸다
    // (예전엔 실패가 빈 결과로 흡수됐다).
    const prompt = buildApiExtractionPrompt(text)
    const rawContent = await callOpenAiChat({ apiKey: openaiApiKey, prompt, temperature: 0.2 })
    const defs = normalizeApiDefs(rawContent)

    return new Response(JSON.stringify({ defs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[api-doc-parse] error:", msg, err)
    return new Response(
      JSON.stringify({ error: msg, detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

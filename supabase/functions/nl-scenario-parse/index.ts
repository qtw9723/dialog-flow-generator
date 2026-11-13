import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { normalizeExtracted, buildExtractionPrompt } from "../../../src/lib/pocDoc/parseDocResponse.ts"
import { callOpenAiChat, TRUNCATED_MESSAGE } from "../_shared/llmCall.ts"

// nl-scenario-parse: 자연어 설명 텍스트 → Extracted(챗봇/시나리오 구조).
// poc-doc-parse와 동일 파이프라인 — 자연어는 이미 텍스트라 "문서 파싱 앞단"만 없다.
// 순수 로직(buildExtractionPrompt·normalizeExtracted)은 src/lib/pocDoc에서 재사용(중복 금지).

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

    const prompt = buildExtractionPrompt(text)

    // callOpenAiChat은 일시 오류(429·5xx)를 스스로 재시도하고, 끝내 실패하거나 잘리면 던진다
    // (공유 모듈, 마스킹도 거기서 처리). 실패 시 502 응답 형태({error, status, detail})는
    // 프론트가 그대로 읽으므로 유지한다.
    // ⚠ 예전엔 여기서 1회 재시도를 직접 했다. 공유 모듈이 재시도하게 된 뒤(2026-10-14)에도
    //    남겨 두면 횟수가 곱해진다(3×2=6회) — 그래서 걷어냈다. 잘린 응답은 원래부터 재시도 안 했다.
    let rawContent: string
    try {
      rawContent = await callOpenAiChat({ apiKey: openaiApiKey, prompt, temperature: 0.2 })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      // useApi는 error(또는 message)만 읽는다 — detail에만 실패 사유를 담으면 화면에는
      // "LLM 호출 실패"만 뜨고 잘림 안내가 사라진다. error에 진짜 사유를 싣는다.
      const statusMatch = detail === TRUNCATED_MESSAGE ? null : detail.match(/\(HTTP (\d+)\)/)
      const status = statusMatch ? Number(statusMatch[1]) : 502
      console.error("[nl-scenario-parse] LLM 호출 실패:", status, detail)
      return new Response(
        JSON.stringify({ error: detail, status, detail }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const extracted = normalizeExtracted(rawContent)

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[nl-scenario-parse] error:", msg, err)
    return new Response(
      JSON.stringify({ error: msg, detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

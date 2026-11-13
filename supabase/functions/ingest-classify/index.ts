import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { callOpenAiChat } from "../_shared/llmCall.ts"
import { parseKinds } from "./parseKinds.ts"

// ingest-classify: ambiguous 판정된 파일들을 LLM으로 kind 재판정.
// POST { files: [{ name, snippet }, ...] } → { kinds: ['esd'|'api'|'scenario'|'ambiguous', ...] }
// kinds는 입력 files와 동일 순서·길이. 모호·실패 시 'ambiguous'로 채운다(2026-09-28 변경 —
// 예전엔 'scenario'로 채워 ESD·API 파일이 조용히 시나리오 파서로 흘러갔다).
// LLM 호출 실패는 삼키지 않고 던진다 — 최상위 catch가 500으로 응답한다.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

function buildClassifyPrompt(files: Array<{ name: string; snippet: string }>): string {
  const fileList = files
    .map((f, i) => `[${i + 1}] 파일명: ${f.name}\n내용 스니펫:\n${f.snippet}`)
    .join("\n\n")

  return `다음 파일들을 각각 esd, api, scenario 중 하나로 분류하라.
분류 기준:
- esd: ESD(전자 시스템 설계) 데이터 표 — 변수명·노드·플로우 정의를 담은 표 형식(Excel/CSV).
- api: API 명세 문서 — OpenAPI/Swagger JSON·YAML, REST API 레퍼런스(엔드포인트·파라미터·스키마).
- scenario: 시나리오·유스케이스·서술형 — 위 두 유형에 해당하지 않으면 scenario.

파일 목록:
${fileList}

응답: JSON 배열만 출력 (설명 없이), 순서·길이는 입력 파일과 동일.
예: ["esd", "api", "scenario"]`
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { files } = await req.json() as { files?: Array<{ name: string; snippet: string }> }

    if (!Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: "files 필드가 필요합니다 (비어있지 않은 배열)" }),
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

    const prompt = buildClassifyPrompt(files)
    const rawContent = await callOpenAiChat({ apiKey: openaiApiKey, prompt, temperature: 0.1 })
    const kinds = parseKinds(rawContent, files.length)

    return new Response(JSON.stringify({ kinds }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[ingest-classify] error:", msg, err)
    return new Response(
      JSON.stringify({ error: msg, detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

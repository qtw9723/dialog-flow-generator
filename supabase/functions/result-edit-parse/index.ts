import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// deno-lint-ignore-file no-explicit-any
import { validatePatch, isReplaceFlow } from "../../../src/lib/edit/editPatch.js"
import { applyEditPatch } from "../../../src/lib/edit/applyEditPatch.js"
import { toFlowSpecView, applyRepairedView } from "../../../src/lib/edit/flowSpecView.js"
import { validateFlow, repairFlow } from "../dialogflow-generator/flow/validateFlow.ts"
import { callOpenAiChat } from "../_shared/llmCall.ts"

// result-edit-parse: 자연어 수정 지시 → 편집 패치 → 머신트리 적용 + checkBot 재검증.
// nl-scenario-parse와 동일 CORS·OpenAI 패턴. 순수 substrate는 src/lib/edit/에서 import(재구현 금지).
// solution_rules 무접촉 — 편집 해석 프롬프트는 함수 안(생성 규칙이 아님).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

function buildEditPrompt(flow: unknown, instruction: string, esd: unknown, mode?: string): string {
  const flowStr = JSON.stringify(flow, null, 2)
  const esdStr = esd ? `\n## ESD 컨텍스트\n${JSON.stringify(esd, null, 2)}\n` : ""

  let modeHint = ""
  if (mode === "patch") {
    modeHint = "\n⚠️ 제약: replace_flow op는 사용하지 마세요. 부분 수정 op만 사용하세요.\n"
  } else if (mode === "regenerate") {
    modeHint = "\n⚠️ 제약: replace_flow op를 사용하여 전체 플로우를 재작성하세요.\n"
  }

  return `당신은 챗봇 플로우 편집 전문가입니다. 아래 수정 지시를 분석하여 플로우에 적용할 편집 패치(JSON 배열)를 산출하세요.

## 현재 플로우 (머신 다이얼로그 트리 JSON)
\`\`\`json
${flowStr}
\`\`\`

## 수정 지시
${instruction}
${esdStr}
## 사용 가능한 편집 op

- set_ment: output 노드 멘트(config.items[0].text[0].texts) 교체
  { "op": "set_ment", "nodeId": "노드ID", "texts": ["멘트1", "멘트2"] }

- update_node: 노드 속성 부분 수정 (label/condition/config/body/actions)
  { "op": "update_node", "nodeId": "노드ID", "changes": { "label"?: "...", "condition"?: "...", "config"?: {}, "body"?: "...", "actions"?: [] } }

- remove_node: 노드 삭제 — 자식이 부모에 자동 재연결됨
  { "op": "remove_node", "nodeId": "노드ID" }

- add_node: 노드 추가
  { "op": "add_node", "dialogId": "다이얼로그ID", "node": { "id": "새ID", "type": "노드타입" }, "parentId"?: "부모ID" }

- set_branch: 분기 조건·다음 노드 설정
  { "op": "set_branch", "nodeId": "노드ID", "condition": "조건문자열", "then": ["다음노드ID"] }

- remove_branch: 분기 조건 제거
  { "op": "remove_branch", "nodeId": "노드ID", "condition": "조건문자열" }

- replace_flow: 플로우 전체 재작성 — 구조 변경이 매우 크거나 부분 패치로 표현 불가 시
  { "op": "replace_flow", "flow": { ...전체 플로우 JSON... } }
${modeHint}
## 응답 규칙
- 수정 지시가 명확한 경우: 적합한 op 배열만 JSON으로 반환 (마크다운 코드블록 없이)
- 수정 지시가 모호하거나 파괴적 추측 없이 표현 불가한 경우: 빈 배열 [] 반환
- JSON 배열만 출력. 설명 텍스트 없이.`
}

function extractJsonFromLLMResponse(content: string): unknown {
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim())
  const arrayMatch = content.match(/\[[\s\S]*\]/)
  if (arrayMatch) return JSON.parse(arrayMatch[0])
  return JSON.parse(content.trim())
}

function safeClarificationResponse(flow: unknown, clarification: string): Response {
  return new Response(JSON.stringify({
    newFlow: flow,
    patch: [],
    mode: "patch",
    validation: { valid: true, errors: [] },
    changedNodeIds: [],
    clarification,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json() as { flow?: unknown; instruction?: string; esd?: unknown; mode?: string }
    const { flow, instruction, esd, mode: modeInput } = body

    if (!flow || !instruction || typeof instruction !== "string" || instruction.trim() === "") {
      return new Response(
        JSON.stringify({ error: "flow와 instruction 필드가 필요합니다" }),
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

    const prompt = buildEditPrompt(flow, instruction, esd, modeInput)

    // 공유 모듈로 호출 — HTTP 오류·잘린 응답은 여기서 던져서 최상위 catch(500)로 간다.
    // "수정 지시를 이해하지 못했습니다"는 이제 LLM이 실제로 응답했는데 파싱이 안 될 때만 나온다.
    const rawContent = await callOpenAiChat({ apiKey: openaiApiKey, prompt, temperature: 0.2 })

    // ⚠ ok=200인데 content가 비는 경우가 있다. 그건 "지시가 모호"한 게 아니라 LLM이 아무것도
    //    돌려주지 않은 것이다. 사용자 탓으로 돌리지 않는다.
    if (rawContent.trim() === "") {
      return new Response(
        JSON.stringify({ error: "LLM이 빈 응답을 돌려줬습니다. 잠시 후 다시 시도해주세요." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // LLM 응답에서 패치 파싱
    let patch: unknown
    try {
      patch = extractJsonFromLLMResponse(rawContent)
    } catch {
      return safeClarificationResponse(flow, "수정 지시를 이해하지 못했습니다. 더 구체적으로 알려주세요.")
    }

    // 빈 배열 = 모호 지시 안전 반환
    if (Array.isArray(patch) && patch.length === 0) {
      return safeClarificationResponse(flow, "지시가 모호합니다. 어떤 부분을 어떻게 수정할지 구체적으로 알려주세요.")
    }

    // T1 validatePatch로 형태 검증
    const patchValidation = (validatePatch as any)(patch)
    if (!patchValidation.valid) {
      return safeClarificationResponse(flow, "수정 지시를 처리할 수 없습니다. 지시를 다시 확인해 주세요.")
    }

    // T2 applyEditPatch로 적용
    const { flow: newFlow, changedNodeIds } = (applyEditPatch as any)(flow, patch)

    // T4 toFlowSpecView → validateFlow로 재검증
    const { view, catalog } = (toFlowSpecView as any)(newFlow)
    let validation = validateFlow(view, catalog)

    let finalFlow = newFlow
    if (!validation.valid) {
      // repairFlow → applyRepairedView로 prune 반영
      const { flow: repairedView } = repairFlow(view, catalog)
      finalFlow = (applyRepairedView as any)(newFlow, repairedView)
      const { view: finalView, catalog: finalCatalog } = (toFlowSpecView as any)(finalFlow)
      validation = validateFlow(finalView, finalCatalog)
    }

    // mode 판정: replace_flow 포함 → 'regenerate', 그 외 → 'patch'
    const actualMode = (isReplaceFlow as any)(patch) ? "regenerate" : "patch"

    return new Response(JSON.stringify({
      newFlow: finalFlow,
      patch,
      mode: actualMode,
      validation,
      changedNodeIds,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[result-edit-parse] error:", msg, err)
    return new Response(
      JSON.stringify({ error: msg, detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

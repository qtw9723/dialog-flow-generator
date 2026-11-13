import { categoryDescriptions, ExistingRule, VALID_CATEGORIES } from "./categories.ts"

function categoryList(): string {
  return VALID_CATEGORIES
    .filter((c) => c !== "System Variable")
    .map((c) => `- ${c}: ${categoryDescriptions[c] || ""}`)
    .join("\n")
}

// 입력(자연어 규칙 또는 예시 봇 JSON) → 생성 규칙 후보 배열을 뽑는 프롬프트.
export function buildDerivePrompt(source: "text" | "json", input: string): string {
  const sourceGuide = source === "json"
    ? `아래는 생성된 챗봇 JSON 예시다. 이 결과에서 드러나는 문제(안티패턴)를 찾아, 다음에 그런 결과가 나오지 않도록 하는 생성 규칙으로 **교정**해 도출하라.`
    : `아래는 사람이 적은 생성 규칙(자연어)이다. 이를 규칙 행으로 정형화하라.`
  return `너는 DialogFlow 챗봇 생성기의 규칙 관리자다. ${sourceGuide}
한 입력에서 여러 규칙이 나올 수 있다(서로 다른 카테고리/단계면 분리). 각 규칙은 아래 카테고리 중 하나로 분류한다.

[카테고리]
${categoryList()}

[입력]
${input}

[출력 — JSON만, 이 형태]
{ "candidates": [
  { "category": "<카테고리>", "title": "<짧은 제목>",
    "description": "<프롬프트에 주입될 규칙 본문(명령형, 구체적으로)>",
    "content": { "text": "<한 줄 요약>" } }
] }
JSON만 출력.`
}

// 각 후보를 "같은 stage 기존 규칙"과 비교해 충돌 유형/제안 action을 분류하는 프롬프트.
export function buildReconcilePrompt(
  candidates: { category: string; title: string; description: string }[],
  relevant: ExistingRule[],
): string {
  const cand = candidates
    .map((c, i) => `[후보 ${i}] (${c.category}) ${c.title}\n${c.description}`)
    .join("\n\n")
  const exist = relevant.length
    ? relevant.map((r) => `- id=${r.id} (${r.category}) ${r.title}: ${r.description || ""}`).join("\n")
    : "(없음)"
  return `각 후보 규칙을 아래 "기존 규칙"과 비교해 정합화 분류를 하라. 같은 단계에서 동시에 적용되면 모순될 수 있는지 본다.

[기존 규칙(같은 단계)]
${exist}

[후보]
${cand}

[분류 기준]
- none: 충돌·중복 없음(새 규칙).
- duplicate: 사실상 동일.
- conflict: 기존과 상충(둘 다 두면 모순).
- refine: 기존을 보강·구체화(같은 주제, 상충은 아님).

[규칙]
- conflict/refine/duplicate이면 가장 관련 깊은 기존 규칙 하나의 id를 targetRuleId로.
- conflict/refine이면 두 규칙을 합친 mergedDescription(병합 초안)을 제시.
- action 기본 제안: none→add, duplicate→skip, conflict/refine→replace.

[출력 — JSON만, 후보 순서대로]
{ "results": [
  { "type": "none|duplicate|conflict|refine", "action": "add|replace|skip",
    "targetRuleId": "<id 또는 빈문자열>", "rationale": "<근거 한국어>",
    "mergedDescription": "<병합 초안 또는 빈문자열>" }
] }
JSON만 출력.`
}

// LLM 응답에서 JSON 추출(코드펜스/잡텍스트 제거). 실패 시 null.
export function parseLlm(raw: string): any {
  if (!raw) return null
  let t = String(raw).trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  else {
    const a = t.indexOf("{")
    const b = t.lastIndexOf("}")
    if (a >= 0 && b > a) t = t.slice(a, b + 1)
  }
  try { return JSON.parse(t) } catch { return null }
}

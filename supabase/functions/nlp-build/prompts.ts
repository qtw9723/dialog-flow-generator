// nlp-build 전용 프롬프트 조립 (순수 — HTTP·LLM 없음).
//
// 지침은 _shared/nlpPromptParts.ts에서 가져온다. 여기에는 **입력 구조에 매인 지시만** 둔다.
// 시나리오 경로의 "갈림길마다 분류 엔티티" 규칙은 갈림길 데이터가 있어야 성립하므로,
// 도구 경로는 확정 인텐트의 예문에서 갈릴 축을 찾게 바꿔 쓴다.
import {
  entityClassifyLine, ENTITY_COLLECT_LINES,
  utteranceGuide, SYNONYM_GUIDE,
  OUTPUT_SPEC_INTENTS, OUTPUT_SPEC_ENTITIES,
} from "../_shared/nlpPromptParts.ts"
import { assignIntentNames } from "../_shared/intentName.ts"
import { normalizeNlpBundle } from "../_shared/deriveNlpData.ts"
import type { NlpBundle } from "../_shared/deriveNlpData.ts"

export interface IntentLite { name: string; examples: string[] }

export function buildIntentPrompt(description: string): string {
  return `DialogFlow 챗봇의 NLP 인텐트를 만들어라. 이번 단계에서는 엔티티를 만들지 않는다.

[업무 설명]
${description}

[인텐트 — 업무 단위 1:1]
- 설명에서 사용자가 요청할 만한 업무 단위를 뽑아 인텐트로 만든다.
- 이름은 한글 업무명으로 짧게 짓는다(예: "반품 접수", "배송 조회"). 공백은 있어도 된다 — 호출부가 정규화한다.
- 인사·잡담처럼 업무 단위가 아닌 것은 만들지 않는다.
- 인텐트마다 어터런스(example) 20~30개.
- **다른 인텐트와 겹치는 예문을 만들지 마라** — 겹치면 NLP가 둘을 구분할 수 없다.

${utteranceGuide("업무 설명에 나온 기능 단어")}

${OUTPUT_SPEC_INTENTS}`
}

export function buildEntityPrompt(description: string, intents: IntentLite[]): string {
  const intentText = (intents || []).map((it, i) => {
    const examples = (it.examples || []).map((e) => `   - ${e}`).join("\n")
    return `${i + 1}. ${it.name}\n${examples || "   (예문 없음)"}`
  }).join("\n")

  return `DialogFlow 챗봇의 NLP 엔티티를 만들어라. 인텐트는 아래로 이미 확정됐다.

[업무 설명]
${description}

[확정된 인텐트와 예문 — 전부]
${intentText}

[엔티티 — 두 종류]
${entityClassifyLine("확정된 인텐트의 예문에서 발화로 갈리는 갈래를 찾아 뽑는다.")}
- **확정된 인텐트의 예문을 읽고, 같은 인텐트 안에서 사용자 발화로 갈리는 축을 찾아 분류 엔티티로 만들어라.**
  예: "배송조회" 예문에 "언제 와요"와 "지금 어디예요"가 섞여 있으면 → 엔티티 "배송정보", value "예상도착일"·"배송상태".
  이 엔티티가 없으면 플로우가 그 갈래를 고를 수단이 없다.
  (조회 성공·실패처럼 사용자 발화와 무관한 갈림길은 만들지 않는다.)
${ENTITY_COLLECT_LINES}

${SYNONYM_GUIDE}

${OUTPUT_SPEC_ENTITIES}`
}

/**
 * LLM이 돌려준 인텐트를 정규화하고 이름을 기존 규칙으로 확정한다.
 * normalizeNlpBundle로 먼저 병합(이름별 합치기·예문 중복 제거)한 뒤,
 * 그 순서대로 assignIntentNames를 적용한다 — 시나리오 경로와 같은 이름 규칙이다.
 */
export function finalizeIntents(raw: unknown): NlpBundle["intents"] {
  const merged = normalizeNlpBundle(raw).intents
  const names = assignIntentNames(merged.map((it) => it.name))
  return merged
    .map((it, i) => ({ ...it, name: names[i] }))
    .filter((it) => it.name !== "")
}

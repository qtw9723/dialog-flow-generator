/** 추출 중간 스키마의 연동 항목. 현재는 ESD 전용(API 자동추출 제외 — spec 참고). */
export interface ExtractedIntegration {
  purpose: string       // 연동 목적. 비면 항목 폐기(쓰레기 ESD 노드 방지).
  send?: string[]       // 보낼 정보 = 이 연동에 넘길 수집 변수명.
  resultName?: string   // 결과를 담을 변수명.
}

export interface ExtractedScenario {
  name?: string
  trigger?: string
  collect?: string[]
  done?: string
  branches?: unknown[]
  integrations?: ExtractedIntegration[]
}

export interface Extracted {
  botName?: string
  personality?: string
  scenarios: ExtractedScenario[]
}

/** ApiIntegrationField의 ESD 연동 방식 선택값(정확히 일치해야 designFlow가 esd 노드를 만든다). */
export const ESD_WAY = "내부 데이터 저장·조회 (ESD)"

/**
 * ExtractedIntegration[] → 시나리오 `외부 연동` 항목 배열(ESD).
 * purpose 없는 항목은 폐기. assembleResponses·buildPreviewState가 공유해 드리프트 방지.
 */
export function mapIntegrationsToExternal(
  integrations: ExtractedIntegration[] | undefined | null,
): Record<string, unknown>[] {
  if (!Array.isArray(integrations)) return []
  return integrations
    .filter(
      (it): it is ExtractedIntegration =>
        !!it && typeof it === "object" &&
        typeof it.purpose === "string" && it.purpose.trim() !== "",
    )
    .map((it) => ({
      "연동 방식": ESD_WAY,
      "연동 목적": it.purpose,
      "보낼 정보": Array.isArray(it.send) ? it.send.filter((s) => typeof s === "string") : [],
      "결과를 담을 이름": typeof it.resultName === "string" ? it.resultName : "",
    }))
}

export interface Question {
  id: string
  text: string
  question_role?: string
  [key: string]: unknown
}

/**
 * Maps an extracted POC doc structure to the existing `responses` format
 * (Record<questionId, value>) so it can flow through the existing pipeline.
 *
 * Contracts (must stay in sync with index.ts):
 *   - Bot name:  question whose text includes "챗봇 이름"     → extracted.botName
 *   - Scenarios: question with role "required_context"       → array of template-field objects
 *   - Scenario object keys: "시나리오 이름" / "진입 발화" /
 *     "수집 정보" (array of {항목명}) / "완료 시 결과"
 *
 * Safety: unknown keys in extracted are ignored; missing/empty fields stay empty.
 */
export function assembleResponses(
  extracted: Extracted,
  questions: Question[],
  _template?: unknown,
): Record<string, unknown> {
  const responses: Record<string, unknown> = {}

  // 1. Bot name ─ question text에 "챗봇 이름" 포함
  const botNameQ = questions.find(
    (q) => typeof q.text === "string" && q.text.includes("챗봇 이름"),
  )
  if (botNameQ && extracted.botName != null && extracted.botName !== "") {
    responses[botNameQ.id] = String(extracted.botName)
  }

  // 2. Scenario input ─ required_context 역할 + "시나리오" 포함 우선, 없으면 첫 required_context
  const scenarioQ =
    questions.find(
      (q) =>
        q.question_role === "required_context" &&
        typeof q.text === "string" &&
        q.text.includes("시나리오"),
    ) ?? questions.find((q) => q.question_role === "required_context")

  if (scenarioQ && Array.isArray(extracted.scenarios)) {
    responses[scenarioQ.id] = extracted.scenarios.map((s) => {
      const obj: Record<string, unknown> = {
        "시나리오 이름": s.name ?? "",
        "진입 발화": s.trigger ?? "",
        "수집 정보": Array.isArray(s.collect)
          ? s.collect.map((item) => ({ "항목명": String(item) }))
          : [],
        "완료 시 결과": s.done ?? "",
      }
      if (Array.isArray(s.branches) && s.branches.length > 0) {
        obj["분기"] = s.branches
      }
      const external = mapIntegrationsToExternal(s.integrations)
      if (external.length > 0) {
        obj["외부 연동"] = external
      }
      return obj
    })
  }

  return responses
}

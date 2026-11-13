import type { ExtractedScenario } from "./assembleResponses.ts"
import { mapIntegrationsToExternal } from "./assembleResponses.ts"

interface TemplateField {
  name: string
  type: string
  [key: string]: unknown
}

interface Template {
  fields?: TemplateField[]
}

function makeEmptyFromTemplate(template: Template | null | undefined): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const field of template?.fields || []) {
    obj[field.name] = field.type === "group_list" || field.type === "multi_select" ? [] : ""
  }
  return obj
}

/**
 * Maps ExtractedScenario[] → template-field-keyed objects for ScenarioQuestionCard.
 * Missing fields default to template empty values; unknown keys are ignored.
 */
export function mapExtractedToScenarios(
  extractedScenarios: ExtractedScenario[],
  template: Template | null | undefined,
): Record<string, unknown>[] {
  return (extractedScenarios || []).map((s) => {
    const base = makeEmptyFromTemplate(template)
    if (s.name != null) base["시나리오 이름"] = s.name
    if (s.trigger != null) base["진입 발화"] = s.trigger
    if (s.done != null) base["완료 시 결과"] = s.done
    base["수집 정보"] = Array.isArray(s.collect)
      ? s.collect.filter((i) => typeof i === "string").map((i) => ({ 항목명: i }))
      : []
    // ESD 연동(자유 자연어에서 추출) → '외부 연동'. preview에서 수정 가능하게 렌더된다.
    base["외부 연동"] = mapIntegrationsToExternal(s.integrations)
    return base
  })
}

/**
 * True if `scenarios` contains at least one scenario with meaningful content —
 * any non-blank string field, or any non-empty array field. Empty array, or
 * scenarios whose every field is "" / [] (template defaults), count as none.
 * Used to block generating a result with no scenario.
 */
export function hasUsableScenario(
  scenarios: Record<string, unknown>[] | null | undefined,
): boolean {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return false
  return scenarios.some((s) => {
    if (!s || typeof s !== "object") return false
    return Object.values(s).some((v) => {
      if (typeof v === "string") return v.trim() !== ""
      if (Array.isArray(v)) return v.length > 0
      return false
    })
  })
}

/**
 * Builds the responses Record from preview edit state (botName + scenarios).
 * Pure: no side effects, easily testable.
 */
export function buildResponsesFromPreview(
  botNameQId: string | undefined,
  scenarioQId: string | undefined,
  botName: string,
  scenarios: Record<string, unknown>[],
): Record<string, unknown> {
  const responses: Record<string, unknown> = {}
  if (botNameQId && botName.trim()) responses[botNameQId] = botName
  if (scenarioQId !== undefined) responses[scenarioQId] = scenarios
  return responses
}

// 데이터-구동 규칙 라우팅.
// solution_rules(어드민·학습이 관리하는 DB 테이블)의 행을 프롬프트 단계별로 묶어
// 각 단계 프롬프트에 동적으로 주입한다. 규칙을 코드에 하드코딩하지 않고 DB가 source of truth.

// 카테고리 목록·설명·stage 매핑은 _shared가 단일 소스다(세 곳 복제가 어긋난 뒤 통합).
export type { RuleStage } from "../../_shared/solutionRuleCategories.ts"
export { RULE_STAGE_BY_CATEGORY } from "../../_shared/solutionRuleCategories.ts"
import type { RuleStage } from "../../_shared/solutionRuleCategories.ts"
import { RULE_STAGE_BY_CATEGORY } from "../../_shared/solutionRuleCategories.ts"

export interface SolutionRuleRow {
  category?: string
  title?: string
  description?: string
  content?: unknown
  order_index?: number
}

// 한 규칙 행에서 프롬프트에 넣을 지시 텍스트를 뽑는다.
// 우선순위: description(사람이 쓴 규칙 본문) → content.text → content가 문자열 → content JSON.
export function ruleText(row: SolutionRuleRow): string {
  if (row && typeof row.description === "string" && row.description.trim()) {
    return row.description.trim()
  }
  const c = row?.content
  if (c && typeof c === "object" && typeof (c as any).text === "string" && (c as any).text.trim()) {
    return (c as any).text.trim()
  }
  if (typeof c === "string" && c.trim()) return c.trim()
  if (c != null) {
    try { return JSON.stringify(c) } catch { /* noop */ }
  }
  return ""
}

// 규칙 행들을 단계별로 묶어 렌더된 라인 배열로 반환한다(order_index 정렬).
export function groupRulesByStage(rows: SolutionRuleRow[]): Record<RuleStage, string[]> {
  const out: Record<RuleStage, string[]> = { flow: [], config: [], output: [], condition: [] }
  const sorted = [...(rows || [])].sort(
    (a, b) => (a?.order_index ?? 0) - (b?.order_index ?? 0),
  )
  for (const row of sorted) {
    const stages = RULE_STAGE_BY_CATEGORY[row?.category || ""] || []
    const text = ruleText(row)
    if (!text) continue
    const line = row?.title ? `- ${row.title}: ${text}` : `- ${text}`
    for (const stage of stages) out[stage].push(line)
  }
  return out
}

// 단계 규칙 라인들을 프롬프트 섹션 텍스트로. 비면 빈 문자열.
export function renderRuleSection(lines: string[]): string {
  return lines && lines.length ? lines.join("\n") : ""
}

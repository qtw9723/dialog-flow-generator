// solution_rules 카테고리 — **_shared가 단일 소스다**(2026-08-28 통합).
//
// 이 파일은 원래 "엣지 함수 간 import 회피"로 목록을 복제하고 있었는데, 그 복제가
// 어긋났다: 본체가 9종(Loop Rule·NLP Function Reference 추가)이 된 뒤에도 여기는
// **7종에 머물러** 학습이 그 두 카테고리를 유효하지 않다고 판단했다.
// 이제 재수출만 한다 — 학습 전용 헬퍼(ExistingRule·relevantExistingRules)만 여기 남는다.
export type { RuleStage } from "../../_shared/solutionRuleCategories.ts"
export {
  VALID_CATEGORIES,
  categoryDescriptions,
  RULE_STAGE_BY_CATEGORY,
  stagesForCategory,
  isValidCategory,
} from "../../_shared/solutionRuleCategories.ts"
import { stagesForCategory } from "../../_shared/solutionRuleCategories.ts"

export interface ExistingRule {
  id: string
  category: string
  title: string
  description?: string
}

// 후보 카테고리와 stage가 하나라도 겹치는 기존 규칙만(같은 단계에서만 충돌하므로).
export function relevantExistingRules(candidateCategory: string, existing: ExistingRule[]): ExistingRule[] {
  const cs = new Set(stagesForCategory(candidateCategory))
  if (cs.size === 0) return []
  return (existing || []).filter((r) => stagesForCategory(r.category).some((s) => cs.has(s)))
}

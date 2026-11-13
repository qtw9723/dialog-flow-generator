// 루프(subflow) 동작의 튜너블 파라미터. solution_rules의 'Loop Rule' 설정 행에서 읽고,
// 부재/이상 시 코드 기본값으로 폴백한다(기능이 죽지 않음). 규칙=DB, 로직=코드(CLAUDE.md).
export interface LoopBehavior {
  exitCompare: "== true" | "truthy"   // 탈출 조건식 스타일
  autoInitFlag: boolean               // 루프 진입 전 exitVar=false set 자동 주입 여부
  defaultMax: number                  // 안전 최대 반복(노드 max 미지정 시)
}

// 기본 truthy: 프로덕션 레퍼런스(레스토랑·샘플 보험사)의 모든 루프가 맨 truthy(예: context.isMenu)를
// 쓰고 "== true" 형태는 전무 → 관용에 맞춰 truthy를 기본값으로. set value 'true'/'false'는 식으로
// 평가돼 boolean이 되므로 truthy와 정확히 맞물린다. exitCompare="== true"는 어드민에서 선택 가능.
export const DEFAULT_LOOP_BEHAVIOR: LoopBehavior = {
  exitCompare: "truthy",
  autoInitFlag: true,
  defaultMax: 10,
}

const SETTING_TITLE = "루프 동작 설정"

export function resolveLoopBehavior(
  rows: Array<{ category?: string; title?: string; content?: unknown }>,
): LoopBehavior {
  const row = (rows || []).find((r) => r?.category === "Loop Rule" && r?.title === SETTING_TITLE)
  const c: any = row?.content
  if (!c || typeof c !== "object") return DEFAULT_LOOP_BEHAVIOR
  const exitCompare = c.exitCompare === "truthy" || c.exitCompare === "== true"
    ? c.exitCompare : DEFAULT_LOOP_BEHAVIOR.exitCompare
  const autoInitFlag = typeof c.autoInitFlag === "boolean" ? c.autoInitFlag : DEFAULT_LOOP_BEHAVIOR.autoInitFlag
  const defaultMax = Number.isInteger(c.defaultMax) && c.defaultMax > 0 ? c.defaultMax : DEFAULT_LOOP_BEHAVIOR.defaultMax
  return { exitCompare, autoInitFlag, defaultMax }
}

export function exitCondition(exitVar: string, b: LoopBehavior): string {
  return b.exitCompare === "truthy" ? exitVar : `${exitVar} == true`
}

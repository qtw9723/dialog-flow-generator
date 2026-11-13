// 편집 이력 스택 — generation_tiers.edit_history를 다루는 순수 함수 모듈.
// 부수효과·IO 없음. 서버(results PATCH)와 프론트(ResultsContext)가 import 재사용.

const MAX_HISTORY = 20

/**
 * tiers.edit_history 스택에 새 entry를 push한다.
 * 상한 20 초과 시 가장 오래된 것(bottom)부터 drop.
 * @param {object} tiers - generation_tiers 객체(jsonb). edit_history 키 없으면 []로 취급.
 * @param {{ ts: string, mode: string, instruction: string, snapshotBefore: object }} entry
 * @returns {object} 새 tiers 객체(입력 불변 — deep clone 반환)
 */
export function pushEdit(tiers, entry) {
  const cloned = JSON.parse(JSON.stringify(tiers))
  if (!Array.isArray(cloned.edit_history)) cloned.edit_history = []
  cloned.edit_history.push(entry)
  if (cloned.edit_history.length > MAX_HISTORY) {
    cloned.edit_history = cloned.edit_history.slice(cloned.edit_history.length - MAX_HISTORY)
  }
  return cloned
}

/**
 * tiers.edit_history 스택의 top을 pop하고 snapshotBefore를 복원 flow로 반환한다.
 * 빈 스택이거나 edit_history 키가 없으면 안전 no-op(throw 없음).
 * @param {object} tiers - generation_tiers 객체
 * @returns {{ tiers: object, flow: object|null }} tiers는 새 객체(입력 불변)
 */
export function undo(tiers) {
  const cloned = JSON.parse(JSON.stringify(tiers))
  if (!Array.isArray(cloned.edit_history) || cloned.edit_history.length === 0) {
    return { tiers: cloned, flow: null }
  }
  const top = cloned.edit_history.pop()
  return { tiers: cloned, flow: top.snapshotBefore ?? null }
}

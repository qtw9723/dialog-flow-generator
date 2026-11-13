// 조건 없는 시나리오 루트 검출 (순수).
//
// 런타임은 main.then에 적힌 순서대로 진입 조건을 확인한다. 조건 없는 루트는 언제나 걸리므로
// 그 뒤에 오는 시나리오는 영원히 진입하지 못한다. 루트 순서에는 우선순위 의도가 실려 있어
// 자동 정렬하지 않고(설계 E절) 검출·경고만 한다.
//
// greeting(_greeting 트리거)·fallback(catch-all)는 조건 없이 도는 게 정상인 보일러라 제외.

const BOILER_TYPES = new Set(['greeting', 'fallback'])

/**
 * @param {object} flow - 머신 다이얼로그 트리
 * @returns {Array<{nodeId: string, label: string}>}
 */
export function findConditionlessRoots(flow) {
  const main = (flow?.dialogs || []).find((d) => d?.id === 'main')
  if (!main) return []
  const byId = new Map((main.nodes || []).map((n) => [n?.id, n]))
  const out = []
  for (const id of (main.then || [])) {
    const n = byId.get(id)
    if (!n || BOILER_TYPES.has(n.type)) continue
    const cond = String(n.condition ?? n.config?.condition ?? '').trim()
    if (!cond) out.push({ nodeId: n.id, label: String(n.label || '').trim() || n.id })
  }
  return out
}

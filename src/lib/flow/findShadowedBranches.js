// 가려진 분기 검출 (순수) — v0.16.0 항목 1.
//
// 런타임은 분기의 then을 적힌 순서대로 확인하고 맞은 갈래에서 멈춘다. 빈 condition은 true다.
// 그래서 아래 갈래는 절대 실행되지 않는다(죽은 갈래):
//   - empty:       조건 없는 갈래 뒤의 형제 전부
//   - always_true: 조건이 글자 그대로 `true`인 갈래 뒤의 형제 전부
//   - duplicate:   앞 형제와 같은 조건(공백 차이 무시)을 가진 갈래
//
// normalizeElseOrder가 else 하나는 뒤로 보내 교정하지만, else가 2개 이상이거나 `true`·중복
// 조건이면 정렬로 고칠 수 없다. 자동 수정 없이 검출만 한다(어느 갈래가 의도인지 모름).
//
// 대상은 노드의 then(=화면의 분기)뿐이다. 갈래 하위 흐름도 같은 then 트리라 함께 검사된다.
// dialog.then(시나리오 루트)은 진입 우선순위라 findConditionlessRoots 소관이다.

// normalizeElseOrder·findConditionlessRoots와 같은 기준 — top-level condition 우선, 없으면 config.condition.
const condOf = (n) => String(n?.condition ?? n?.config?.condition ?? '').trim()
const normalize = (c) => c.replace(/\s+/g, ' ')
const labelOf = (n, id) => String(n?.label || '').trim() || id

/**
 * @param {object} flow - 머신 다이얼로그 트리
 * @returns {Array<{dialogId: string, nodeId: string, label: string,
 *   reason: 'empty'|'always_true'|'duplicate', blockerId: string, blockerLabel: string,
 *   shadowed: Array<{id: string, label: string}>}>}
 */
export function findShadowedBranches(flow) {
  const out = []
  for (const d of (flow?.dialogs || [])) {
    const nodes = Array.isArray(d?.nodes) ? d.nodes : []
    const byId = new Map(nodes.map((n) => [n?.id, n]))
    for (const n of nodes) {
      const then = n?.then
      if (!Array.isArray(then) || then.length < 2) continue // 분기 아님

      const seen = new Map() // 정규화 조건 → 처음 나온 갈래 id
      for (let i = 0; i < then.length; i++) {
        const id = then[i]
        const c = condOf(byId.get(id))
        if (!c || c === 'true') {
          const rest = then.slice(i + 1)
          if (rest.length) {
            out.push(entry(d, n, c ? 'always_true' : 'empty', id, byId, rest))
          }
          break // 이 뒤는 모두 가려졌다 — 중복 검사도 의미 없음
        }
        const key = normalize(c)
        if (seen.has(key)) {
          out.push(entry(d, n, 'duplicate', seen.get(key), byId, [id]))
        } else {
          seen.set(key, id)
        }
      }
    }
  }
  return out
}

function entry(d, n, reason, blockerId, byId, ids) {
  return {
    dialogId: d.id,
    nodeId: n.id,
    label: labelOf(n, n.id),
    reason,
    blockerId,
    blockerLabel: labelOf(byId.get(blockerId), blockerId),
    shadowed: ids.map((id) => ({ id, label: labelOf(byId.get(id), id) })),
  }
}

/** 화면용 한 줄 설명. */
export function describeShadowed(s) {
  const names = s.shadowed.map((x) => `'${x.label}'`).join(', ')
  if (s.reason === 'duplicate') {
    return `${s.label}: 갈래 ${names}의 조건이 앞 갈래 '${s.blockerLabel}'와 같아 실행되지 않습니다`
  }
  const why = s.reason === 'empty' ? '조건이 없어' : '조건이 항상 참(true)이라'
  return `${s.label}: 갈래 '${s.blockerLabel}'의 ${why} 뒤의 갈래 ${names}는 실행되지 않습니다`
}

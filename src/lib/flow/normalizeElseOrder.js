// 분기의 else(조건 없는 갈래)를 마지막으로 정렬한다(순수).
//
// 왜 필요한가: 조건 없는 갈래는 "형제 조건이 하나도 안 맞을 때" 타는 길이다. then을 순서대로
// 평가하는 런타임에서는 조건 없는 갈래가 언제나 먼저 걸리므로, 그게 앞에 있으면 뒤의 조건
// 갈래는 영원히 실행되지 않는다(죽은 분기). else를 뒤로 보내는 건 어떤 평가 방식에서도
// 안전하므로 — 순서를 안 보는 런타임이면 무해하고, 보는 런타임이면 교정이다 — 자동 정렬한다.
//
// 차단이 아니라 정렬인 이유: 다이어그램 편집기에 then 순서를 바꿀 UI가 없다. 차단만 하면
// 사용자가 고칠 방법이 없다. 대신 무엇을 옮겼는지 moved로 돌려 화면에 알린다.
//
// 대상은 노드의 then(=화면의 분기)뿐이다. dialog.then(시나리오 루트)은 분기가 아니라 진입
// 우선순위라 건드리지 않는다.

// 형제 검출기(findConditionlessRoots.js·refDiagram.js의 entryConditionOf)와 기준을 맞춘다 —
// top-level condition뿐 아니라 config.condition도 조건으로 인정한다.
const hasCondition = (n) => String(n?.condition ?? n?.config?.condition ?? '').trim() !== ''

/**
 * @param {object} flow - 머신 다이얼로그 트리
 * @returns {{flow: object, moved: Array<{nodeId: string, label: string}>}}
 *          flow: 정렬된 사본(옮길 게 없으면 입력 그대로). moved: 정렬한 분기 노드들.
 */
export function normalizeElseOrder(flow) {
  const dialogs = flow?.dialogs
  if (!Array.isArray(dialogs)) return { flow, moved: [] }

  const moved = []
  const newDialogs = dialogs.map((d) => {
    const nodes = d?.nodes
    if (!Array.isArray(nodes)) return d
    const byId = new Map(nodes.map((n) => [n?.id, n]))

    const newNodes = nodes.map((n) => {
      const then = n?.then
      if (!Array.isArray(then) || then.length < 2) return n  // 분기 아님

      const conditioned = then.filter((id) => hasCondition(byId.get(id)))
      const empties = then.filter((id) => !hasCondition(byId.get(id)))
      // 조건 갈래가 없으면 else 개념 자체가 없다(모호 분기 — findAmbiguousBranches 소관).
      if (conditioned.length === 0 || empties.length === 0) return n

      const reordered = [...conditioned, ...empties]  // 조건 갈래끼리의 순서는 보존
      if (reordered.every((id, i) => id === then[i])) return n

      moved.push({ nodeId: n.id, label: n.label || n.id })
      return { ...n, then: reordered }
    })

    return newNodes.some((n, i) => n !== nodes[i]) ? { ...d, nodes: newNodes } : d
  })

  if (!moved.length) return { flow, moved }
  return { flow: { ...flow, dialogs: newDialogs }, moved }
}

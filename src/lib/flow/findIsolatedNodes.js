// 고립 노드 검출 (순수) — 다이어그램 편집 재검증 보강.
// 위상 검증(validateFlowClient)은 노드를 추가하면 그것이 dialog.then의 홀로 떨어진 루트가 되어
// "진입점이자 종결점"으로 취급돼 통과시킨다. 하지만 들어오는·나가는 연결이 모두 없는 노드는
// 실제로는 아무 데도 연결 안 된 불완전 상태다 — 이를 잡아 확정을 차단한다.
//
// 판정은 다이어그램과 동일하게 deriveStructure 기준(화면에 보이는 엣지가 곧 연결).
// 단, **시나리오를 시작하는 노드(진입점)는 제외** — 시작 노드는 들어오는 연결이 없는 게 정상이다.
//   시작 노드 = dialog.then의 루트이면서 진입 조건(condition)을 가진 노드(예: input.text.includes('배송 조회')).
//   갓 추가한 빈 노드도 dialog.then에 얹히지만 진입 조건이 없으므로 시작 노드로 보지 않아 검출된다.
//   (기존/신규 노드를 구분해 무시하지 않는다 — 기존 노드도 수정·연결 해제되면 검출 대상이다.)
import { deriveStructure } from '../refDiagram.js'

const BOILER_TYPES = new Set(['greeting', 'fallback'])

/**
 * @param {object} flow - generated_json 머신 다이얼로그 트리
 * @returns {Array<{nodeId:string, type:string, label:string}>}
 */
export function findIsolatedNodes(flow) {
  const { nodes, edges, loops } = deriveStructure(flow || {})

  const connected = new Set()
  for (const e of (edges || [])) { connected.add(e.from); connected.add(e.to) }
  for (const l of (loops || [])) {
    connected.add(l.id)                                  // 루프(subflow) 노드
    for (const b of (l.bodyIds || [])) connected.add(b)  // 루프 본문 노드는 박스 안에 속함
    for (const e of (l.bodyEdges || [])) { connected.add(e.from); connected.add(e.to) }
  }

  // 머신 트리에서 시작 노드(진입점) 집합 — dialog.then 루트 중 진입 조건을 가진(비-boiler) 노드.
  const startNodes = new Set()
  for (const d of (flow?.dialogs || [])) {
    const byId = new Map((d?.nodes || []).map((n) => [n.id, n]))
    for (const rootId of (d?.then || [])) {
      const n = byId.get(rootId)
      if (!n || BOILER_TYPES.has(n.type)) continue
      if (String(n.condition || '').trim()) startNodes.add(rootId)  // 진입 조건 있는 루트 = 시작점
    }
  }

  return (nodes || [])
    .filter((n) => !connected.has(n.id) && !startNodes.has(n.id))
    .map((n) => ({ nodeId: n.id, type: n.type || '', label: String(n.label || '').trim() }))
}

// 머신트리 ↔ FlowSpec-view 어댑터 — T4
// 순수 함수: DB·fetch·Deno.env 없음. 입력 flow 불변(deep clone 후 작업).

// output·agent 타입만 validateFlow의 isTerminal 불변식 충족에 필요한 종결 타입.
const TERMINAL_TYPES = new Set(['output', 'agent'])

/**
 * generated_json 머신트리를 validateFlow가 받는 FlowSpec-view로 사영한다.
 * @param {object} flow - generated_json 머신트리 (dialogs[].nodes[], then)
 * @returns {{ view: object, catalog: object[] }}
 */
export function toFlowSpecView(flow) {
  const dialogs = flow.dialogs || []

  // 모든 dialog의 노드를 평탄화
  const allNodes = []
  for (const dialog of dialogs) {
    for (const node of (dialog.nodes || [])) {
      allNodes.push(node)
    }
  }

  // FlowSpec 노드 사영: then → next
  const viewNodes = allNodes.map(n => ({
    id: n.id,
    type: n.type,
    intent: n.label || n.type,
    next: Array.isArray(n.then) ? n.then.slice() : [],
  }))

  // entry: 첫 dialog의 첫 then 진입점, 없으면 첫 노드 id
  // 다중 엔트리 모델: 각 dialog.then이 루트 → computeSources가 자동 인식(then 미참조 → source)
  let entry = ''
  for (const dialog of dialogs) {
    if (Array.isArray(dialog.then) && dialog.then.length > 0) {
      entry = dialog.then[0]
      break
    }
  }
  if (!entry && viewNodes.length > 0) entry = viewNodes[0].id

  const view = {
    version: '1',
    entry,
    nodes: viewNodes,
  }

  // 카탈로그: 실제 존재하는 타입만, output/agent는 isTerminal:true
  // 미지 타입으로 인한 오탐 방지 — 존재 타입만 포함
  const seenTypes = new Set()
  const catalog = []
  for (const node of allNodes) {
    if (!seenTypes.has(node.type)) {
      seenTypes.add(node.type)
      catalog.push({
        type: node.type,
        label: node.type,
        description: '',
        promptInstruction: '',
        isTerminal: TERMINAL_TYPES.has(node.type),
      })
    }
  }

  return { view, catalog }
}

/**
 * repairFlow가 정리한 FlowSpec-view를 머신트리에 반영해 삭제된 노드/엣지를 prune한다.
 * @param {object} flow - 원본 generated_json 머신트리
 * @param {object} repairedView - repairFlow 출력 FlowSpec (삭제·정리 반영)
 * @returns {object} 정리된 머신트리 (새 객체, 입력 불변)
 */
export function applyRepairedView(flow, repairedView) {
  const result = JSON.parse(JSON.stringify(flow))

  const repairedNodeIds = new Set((repairedView.nodes || []).map(n => n.id))
  // repair 후 남은 노드별 next 집합 — then 정리 기준
  const repairedNextByNodeId = new Map(
    (repairedView.nodes || []).map(n => [n.id, new Set(n.next || [])])
  )

  for (const dialog of (result.dialogs || [])) {
    // dialog 진입점에서 삭제된 노드 제거
    if (Array.isArray(dialog.then)) {
      dialog.then = dialog.then.filter(id => repairedNodeIds.has(id))
    }

    if (Array.isArray(dialog.nodes)) {
      // 삭제된 노드 제거
      dialog.nodes = dialog.nodes.filter(n => repairedNodeIds.has(n.id))

      // 남은 노드의 then에서 repair로 제거된 참조 정리
      for (const node of dialog.nodes) {
        if (Array.isArray(node.then)) {
          const repairedNext = repairedNextByNodeId.get(node.id)
          node.then = node.then.filter(id => repairedNext ? repairedNext.has(id) : false)
        }
      }
    }
  }

  return result
}

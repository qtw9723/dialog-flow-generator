// 편집 패치 적용기 — T1 계약(editPatch.js)을 소비해 머신트리에 적용한다.
// 순수 함수: DB·fetch·Deno.env 없음. 입력 flow 불변(deep clone 후 작업).
import { EDIT_OPS, changedNodeIdsOf, isReplaceFlow } from './editPatch.js'

/** flow 전체를 탐색해 nodeId를 가진 노드와 그 dialog를 반환한다. */
function findNodeAndDialog(flow, nodeId) {
  for (const dialog of (flow.dialogs || [])) {
    const node = (dialog.nodes || []).find(n => n.id === nodeId)
    if (node) return { node, dialog }
  }
  return null
}

/** arr 내 targetId를 replacements 배열로 교체한다(참조 재배선용). */
function replaceInArray(arr, targetId, replacements) {
  const out = []
  for (const id of arr) {
    if (id === targetId) out.push(...replacements)
    else out.push(id)
  }
  return out
}

/** 단일 op를 이미 deep-cloned된 flow에 적용한다(mutates in place, returns flow). */
function applyOp(flow, op) {
  switch (op.op) {
    case EDIT_OPS.SET_MENT: {
      const found = findNodeAndDialog(flow, op.nodeId)
      if (!found) return flow
      const { node } = found
      if (!node.config) node.config = {}
      if (!Array.isArray(node.config.items) || node.config.items.length === 0) {
        node.config.items = [{ type: 'text', text: [{ texts: op.texts }] }]
      } else {
        const item = node.config.items[0]
        if (!Array.isArray(item.text) || item.text.length === 0) {
          item.text = [{ texts: op.texts }]
        } else {
          item.text[0].texts = op.texts
        }
      }
      return flow
    }
    case EDIT_OPS.UPDATE_NODE: {
      const found = findNodeAndDialog(flow, op.nodeId)
      if (!found) return flow
      const { node } = found
      for (const key of ['label', 'condition', 'config', 'body', 'actions']) {
        if (op.changes[key] !== undefined) node[key] = op.changes[key]
      }
      return flow
    }
    case EDIT_OPS.REMOVE_NODE: {
      for (const dialog of (flow.dialogs || [])) {
        const idx = (dialog.nodes || []).findIndex(n => n.id === op.nodeId)
        if (idx === -1) continue
        const [removed] = dialog.nodes.splice(idx, 1)
        const children = removed.then || []
        // dialog.then 및 나머지 노드의 then에서 삭제된 id를 자식들로 재배선
        dialog.then = replaceInArray(dialog.then || [], op.nodeId, children)
        for (const node of dialog.nodes) {
          if (node.then) node.then = replaceInArray(node.then, op.nodeId, children)
        }
        break
      }
      return flow
    }
    case EDIT_OPS.ADD_NODE: {
      const dialog = (flow.dialogs || []).find(d => d.id === op.dialogId)
      if (!dialog) return flow
      if (!Array.isArray(dialog.nodes)) dialog.nodes = []
      dialog.nodes.push(op.node)
      if (op.parentId) {
        const parent = dialog.nodes.find(n => n.id === op.parentId)
        if (parent) {
          if (!Array.isArray(parent.then)) parent.then = []
          parent.then.push(op.node.id)
        }
      } else {
        if (!Array.isArray(dialog.then)) dialog.then = []
        dialog.then.push(op.node.id)
      }
      return flow
    }
    case EDIT_OPS.SET_BRANCH: {
      const found = findNodeAndDialog(flow, op.nodeId)
      if (!found) return flow
      const { node } = found
      node.condition = op.condition
      node.then = op.then
      return flow
    }
    case EDIT_OPS.REMOVE_BRANCH: {
      const found = findNodeAndDialog(flow, op.nodeId)
      if (!found) return flow
      const { node } = found
      if (node.condition === op.condition) {
        delete node.condition
        node.then = []
      }
      return flow
    }
    case EDIT_OPS.REPLACE_FLOW:
      return op.flow
    default:
      return flow
  }
}

/**
 * 패치(op 배열 또는 단일 op)를 flow에 적용한다.
 * @param {object} flow - generated_json 머신 다이얼로그 트리
 * @param {object|object[]} patch - 편집 패치 (T1 계약 op)
 * @returns {{ flow: object, changedNodeIds: string[] }}
 */
export function applyEditPatch(flow, patch) {
  const ops = Array.isArray(patch) ? patch : [patch]
  const changedNodeIds = changedNodeIdsOf(patch)

  if (isReplaceFlow(patch)) {
    const replaceOp = ops.find(o => o?.op === EDIT_OPS.REPLACE_FLOW)
    return { flow: JSON.parse(JSON.stringify(replaceOp.flow)), changedNodeIds }
  }

  let result = JSON.parse(JSON.stringify(flow))
  for (const op of ops) {
    result = applyOp(result, op)
  }
  return { flow: result, changedNodeIds }
}

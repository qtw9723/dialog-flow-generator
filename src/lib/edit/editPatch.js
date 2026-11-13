// 편집 패치 op 계약 — source of truth (순수, 부수효과·IO 없음).
// ②설문·③다이얼로그 편집 경로가 이 계약을 미러한다.
// 편집 대상: generated_json 머신 다이얼로그 트리
//   { id, name, dialogs:[pre,main,post] }
//   dialog: { then:[루트nodeId], nodes:[...] }
//   node:   { id, type, label, condition, config, then:[자식id], body, actions }
//   멘트:   output 노드 config.items[].text[].texts[]

/** 지원하는 편집 op 종류 */
export const EDIT_OPS = Object.freeze({
  SET_MENT:      'set_ment',
  UPDATE_NODE:   'update_node',
  REMOVE_NODE:   'remove_node',
  ADD_NODE:      'add_node',
  SET_BRANCH:    'set_branch',
  REMOVE_BRANCH: 'remove_branch',
  REPLACE_FLOW:  'replace_flow',
})

/**
 * op별 필수 필드 정의.
 * - set_ment:      { op, nodeId, texts }
 *   texts = string[] — output 노드 최상위 멘트 배열 교체(items[0].text[0].texts 대응).
 * - update_node:   { op, nodeId, changes }
 *   changes = { label?, condition?, config?, body?, actions? }
 * - remove_node:   { op, nodeId }
 * - add_node:      { op, dialogId, node }
 *   node 최소: { id, type }. parentId? 선택(없으면 dialog.then에 루트로 추가).
 * - set_branch:    { op, nodeId, condition, then }
 *   condition = 문자열 조건, then = 자식nodeId 배열.
 * - remove_branch: { op, nodeId, condition }
 *   condition = 제거할 조건 문자열.
 * - replace_flow:  { op, flow }
 *   flow = 전체 generated_json 교체용 머신트리.
 */
const REQUIRED_FIELDS = {
  [EDIT_OPS.SET_MENT]:      ['op', 'nodeId', 'texts'],
  [EDIT_OPS.UPDATE_NODE]:   ['op', 'nodeId', 'changes'],
  [EDIT_OPS.REMOVE_NODE]:   ['op', 'nodeId'],
  [EDIT_OPS.ADD_NODE]:      ['op', 'dialogId', 'node'],
  [EDIT_OPS.SET_BRANCH]:    ['op', 'nodeId', 'condition', 'then'],
  [EDIT_OPS.REMOVE_BRANCH]: ['op', 'nodeId', 'condition'],
  [EDIT_OPS.REPLACE_FLOW]:  ['op', 'flow'],
}

const KNOWN_OPS = new Set(Object.values(EDIT_OPS))

/**
 * 단일 op 객체를 검증한다.
 * @param {object} op
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOp(op) {
  const errors = []
  if (!op || typeof op !== 'object') {
    return { valid: false, errors: ['op가 객체가 아님'] }
  }
  if (!op.op || !KNOWN_OPS.has(op.op)) {
    errors.push(`알 수 없는 op: "${op.op}"`)
    return { valid: false, errors }
  }
  const required = REQUIRED_FIELDS[op.op]
  for (const field of required) {
    if (op[field] === undefined || op[field] === null) {
      errors.push(`"${op.op}"에 필수 필드 "${field}" 없음`)
    }
  }
  // set_ment: texts는 배열이어야 한다
  if (op.op === EDIT_OPS.SET_MENT && op.texts !== undefined && !Array.isArray(op.texts)) {
    errors.push('"set_ment"의 texts는 배열이어야 함')
  }
  // set_branch: then은 배열이어야 한다
  if (op.op === EDIT_OPS.SET_BRANCH && op.then !== undefined && !Array.isArray(op.then)) {
    errors.push('"set_branch"의 then은 배열이어야 함')
  }
  // add_node: node는 객체이고 id·type을 가져야 한다
  if (op.op === EDIT_OPS.ADD_NODE && op.node !== undefined) {
    if (typeof op.node !== 'object') {
      errors.push('"add_node"의 node는 객체여야 함')
    } else {
      if (!op.node.id) errors.push('"add_node"의 node.id 없음')
      if (!op.node.type) errors.push('"add_node"의 node.type 없음')
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * 패치(op 배열 또는 단일 op)를 검증한다.
 * @param {object|object[]} patch
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePatch(patch) {
  const ops = Array.isArray(patch) ? patch : [patch]
  if (ops.length === 0) {
    return { valid: false, errors: ['패치에 op가 없음'] }
  }
  const allErrors = []
  for (let i = 0; i < ops.length; i++) {
    const { errors } = validateOp(ops[i])
    for (const e of errors) allErrors.push(`[${i}] ${e}`)
  }
  return { valid: allErrors.length === 0, errors: allErrors }
}

/**
 * 단일 op에서 변경되는 nodeId 목록을 추출한다.
 * replace_flow는 노드 단위 추출 불가 → 빈 배열(전체 교체 신호).
 * @param {object} op
 * @returns {string[]}
 */
function changedNodeIdsOfOp(op) {
  switch (op.op) {
    case EDIT_OPS.SET_MENT:
    case EDIT_OPS.UPDATE_NODE:
    case EDIT_OPS.REMOVE_NODE:
    case EDIT_OPS.SET_BRANCH:
    case EDIT_OPS.REMOVE_BRANCH:
      return op.nodeId ? [op.nodeId] : []
    case EDIT_OPS.ADD_NODE:
      return op.node?.id ? [op.node.id] : []
    case EDIT_OPS.REPLACE_FLOW:
      return [] // 전체 교체 — 노드 단위 추출 불가
    default:
      return []
  }
}

/**
 * 패치(op 배열 또는 단일 op)에서 변경되는 nodeId를 중복 없이 추출한다.
 * replace_flow가 포함된 경우 빈 배열 반환(전체 교체 신호).
 * @param {object|object[]} patch
 * @returns {string[]}
 */
export function changedNodeIdsOf(patch) {
  const ops = Array.isArray(patch) ? patch : [patch]
  if (ops.some(o => o?.op === EDIT_OPS.REPLACE_FLOW)) return []
  const ids = new Set()
  for (const op of ops) {
    for (const id of changedNodeIdsOfOp(op)) ids.add(id)
  }
  return [...ids]
}

/**
 * 패치에 replace_flow op가 포함되어 있는지 여부.
 * @param {object|object[]} patch
 * @returns {boolean}
 */
export function isReplaceFlow(patch) {
  const ops = Array.isArray(patch) ? patch : [patch]
  return ops.some(o => o?.op === EDIT_OPS.REPLACE_FLOW)
}

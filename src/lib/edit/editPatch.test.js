import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { EDIT_OPS, validatePatch, changedNodeIdsOf, isReplaceFlow } from "./editPatch.js"

// ── EDIT_OPS 상수 ──────────────────────────────────────────────────────────

Deno.test('EDIT_OPS: 7종 op 상수가 모두 존재한다', () => {
  assertExists(EDIT_OPS.SET_MENT)
  assertExists(EDIT_OPS.UPDATE_NODE)
  assertExists(EDIT_OPS.REMOVE_NODE)
  assertExists(EDIT_OPS.ADD_NODE)
  assertExists(EDIT_OPS.SET_BRANCH)
  assertExists(EDIT_OPS.REMOVE_BRANCH)
  assertExists(EDIT_OPS.REPLACE_FLOW)
  assertEquals(Object.keys(EDIT_OPS).length, 7)
})

Deno.test('EDIT_OPS: 값이 기대한 문자열이다', () => {
  assertEquals(EDIT_OPS.SET_MENT,      'set_ment')
  assertEquals(EDIT_OPS.UPDATE_NODE,   'update_node')
  assertEquals(EDIT_OPS.REMOVE_NODE,   'remove_node')
  assertEquals(EDIT_OPS.ADD_NODE,      'add_node')
  assertEquals(EDIT_OPS.SET_BRANCH,    'set_branch')
  assertEquals(EDIT_OPS.REMOVE_BRANCH, 'remove_branch')
  assertEquals(EDIT_OPS.REPLACE_FLOW,  'replace_flow')
})

// ── validatePatch: 유효한 op ───────────────────────────────────────────────

Deno.test('validatePatch: set_ment 정상', () => {
  const r = validatePatch({ op: 'set_ment', nodeId: 'n1', texts: ['안녕하세요'] })
  assertEquals(r.valid, true)
  assertEquals(r.errors.length, 0)
})

Deno.test('validatePatch: update_node 정상', () => {
  const r = validatePatch({ op: 'update_node', nodeId: 'n1', changes: { label: '새 라벨' } })
  assertEquals(r.valid, true)
})

Deno.test('validatePatch: remove_node 정상', () => {
  const r = validatePatch({ op: 'remove_node', nodeId: 'n1' })
  assertEquals(r.valid, true)
})

Deno.test('validatePatch: add_node 정상', () => {
  const r = validatePatch({ op: 'add_node', dialogId: 'main', node: { id: 'n99', type: 'output' } })
  assertEquals(r.valid, true)
})

Deno.test('validatePatch: add_node parentId 옵션 있어도 정상', () => {
  const r = validatePatch({ op: 'add_node', dialogId: 'main', node: { id: 'n99', type: 'output' }, parentId: 'n1' })
  assertEquals(r.valid, true)
})

Deno.test('validatePatch: set_branch 정상', () => {
  const r = validatePatch({ op: 'set_branch', nodeId: 'n1', condition: 'var == 1', then: ['n2'] })
  assertEquals(r.valid, true)
})

Deno.test('validatePatch: remove_branch 정상', () => {
  const r = validatePatch({ op: 'remove_branch', nodeId: 'n1', condition: 'var == 1' })
  assertEquals(r.valid, true)
})

Deno.test('validatePatch: replace_flow 정상', () => {
  const flow = { id: 'f1', name: '테스트', dialogs: [] }
  const r = validatePatch({ op: 'replace_flow', flow })
  assertEquals(r.valid, true)
})

Deno.test('validatePatch: op 배열 정상', () => {
  const r = validatePatch([
    { op: 'set_ment', nodeId: 'n1', texts: ['안녕'] },
    { op: 'remove_node', nodeId: 'n2' },
  ])
  assertEquals(r.valid, true)
})

// ── validatePatch: 거부 케이스 ─────────────────────────────────────────────

Deno.test('validatePatch: 미지의 op는 거부', () => {
  const r = validatePatch({ op: 'unknown_op', nodeId: 'n1' })
  assertEquals(r.valid, false)
  assertEquals(r.errors.length > 0, true)
})

Deno.test('validatePatch: op 필드 자체 없으면 거부', () => {
  const r = validatePatch({ nodeId: 'n1', texts: ['텍스트'] })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: set_ment에서 nodeId 누락 거부', () => {
  const r = validatePatch({ op: 'set_ment', texts: ['텍스트'] })
  assertEquals(r.valid, false)
  assertEquals(r.errors.some(e => e.includes('nodeId')), true)
})

Deno.test('validatePatch: set_ment에서 texts 누락 거부', () => {
  const r = validatePatch({ op: 'set_ment', nodeId: 'n1' })
  assertEquals(r.valid, false)
  assertEquals(r.errors.some(e => e.includes('texts')), true)
})

Deno.test('validatePatch: set_ment texts가 배열 아니면 거부', () => {
  const r = validatePatch({ op: 'set_ment', nodeId: 'n1', texts: '텍스트' })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: update_node에서 changes 누락 거부', () => {
  const r = validatePatch({ op: 'update_node', nodeId: 'n1' })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: add_node에서 dialogId 누락 거부', () => {
  const r = validatePatch({ op: 'add_node', node: { id: 'n1', type: 'output' } })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: add_node에서 node 누락 거부', () => {
  const r = validatePatch({ op: 'add_node', dialogId: 'main' })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: add_node node.id 없으면 거부', () => {
  const r = validatePatch({ op: 'add_node', dialogId: 'main', node: { type: 'output' } })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: add_node node.type 없으면 거부', () => {
  const r = validatePatch({ op: 'add_node', dialogId: 'main', node: { id: 'n1' } })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: set_branch then이 배열 아니면 거부', () => {
  const r = validatePatch({ op: 'set_branch', nodeId: 'n1', condition: 'x', then: 'n2' })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: set_branch condition 누락 거부', () => {
  const r = validatePatch({ op: 'set_branch', nodeId: 'n1', then: ['n2'] })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: remove_branch condition 누락 거부', () => {
  const r = validatePatch({ op: 'remove_branch', nodeId: 'n1' })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: replace_flow flow 누락 거부', () => {
  const r = validatePatch({ op: 'replace_flow' })
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: 빈 배열 거부', () => {
  const r = validatePatch([])
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: null 거부', () => {
  const r = validatePatch(null)
  assertEquals(r.valid, false)
})

Deno.test('validatePatch: 배열에 하나라도 잘못되면 거부', () => {
  const r = validatePatch([
    { op: 'remove_node', nodeId: 'n1' },
    { op: 'unknown_op' },
  ])
  assertEquals(r.valid, false)
})

// ── changedNodeIdsOf ───────────────────────────────────────────────────────

Deno.test('changedNodeIdsOf: set_ment → nodeId 반환', () => {
  const ids = changedNodeIdsOf({ op: 'set_ment', nodeId: 'n1', texts: [] })
  assertEquals(ids, ['n1'])
})

Deno.test('changedNodeIdsOf: update_node → nodeId 반환', () => {
  const ids = changedNodeIdsOf({ op: 'update_node', nodeId: 'n5', changes: {} })
  assertEquals(ids, ['n5'])
})

Deno.test('changedNodeIdsOf: remove_node → nodeId 반환', () => {
  const ids = changedNodeIdsOf({ op: 'remove_node', nodeId: 'n3' })
  assertEquals(ids, ['n3'])
})

Deno.test('changedNodeIdsOf: add_node → node.id 반환', () => {
  const ids = changedNodeIdsOf({ op: 'add_node', dialogId: 'main', node: { id: 'n99', type: 'output' } })
  assertEquals(ids, ['n99'])
})

Deno.test('changedNodeIdsOf: set_branch → nodeId 반환', () => {
  const ids = changedNodeIdsOf({ op: 'set_branch', nodeId: 'n2', condition: 'x', then: [] })
  assertEquals(ids, ['n2'])
})

Deno.test('changedNodeIdsOf: remove_branch → nodeId 반환', () => {
  const ids = changedNodeIdsOf({ op: 'remove_branch', nodeId: 'n2', condition: 'x' })
  assertEquals(ids, ['n2'])
})

Deno.test('changedNodeIdsOf: replace_flow → 빈 배열(전체 교체 신호)', () => {
  const ids = changedNodeIdsOf({ op: 'replace_flow', flow: {} })
  assertEquals(ids, [])
})

Deno.test('changedNodeIdsOf: 배열 - 여러 op의 id 합산(중복 제거)', () => {
  const ids = changedNodeIdsOf([
    { op: 'set_ment', nodeId: 'n1', texts: [] },
    { op: 'update_node', nodeId: 'n2', changes: {} },
    { op: 'remove_node', nodeId: 'n1' }, // n1 중복
  ])
  assertEquals(ids.length, 2)
  assertEquals(ids.includes('n1'), true)
  assertEquals(ids.includes('n2'), true)
})

Deno.test('changedNodeIdsOf: replace_flow 포함 배열 → 빈 배열', () => {
  const ids = changedNodeIdsOf([
    { op: 'set_ment', nodeId: 'n1', texts: [] },
    { op: 'replace_flow', flow: {} },
  ])
  assertEquals(ids, [])
})

// ── isReplaceFlow ──────────────────────────────────────────────────────────

Deno.test('isReplaceFlow: replace_flow op면 true', () => {
  assertEquals(isReplaceFlow({ op: 'replace_flow', flow: {} }), true)
})

Deno.test('isReplaceFlow: 다른 op면 false', () => {
  assertEquals(isReplaceFlow({ op: 'set_ment', nodeId: 'n1', texts: [] }), false)
})

Deno.test('isReplaceFlow: 배열에 replace_flow 포함이면 true', () => {
  assertEquals(isReplaceFlow([
    { op: 'remove_node', nodeId: 'n1' },
    { op: 'replace_flow', flow: {} },
  ]), true)
})

Deno.test('isReplaceFlow: 배열에 replace_flow 없으면 false', () => {
  assertEquals(isReplaceFlow([
    { op: 'remove_node', nodeId: 'n1' },
    { op: 'set_ment', nodeId: 'n2', texts: [] },
  ]), false)
})

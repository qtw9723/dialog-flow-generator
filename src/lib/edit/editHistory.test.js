import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { pushEdit, undo } from "./editHistory.js"

// ── 픽스처 ────────────────────────────────────────────────────────────────────

function makeTiers(history = []) {
  return { edit_history: JSON.parse(JSON.stringify(history)), other: 'preserved' }
}

function makeEntry(n) {
  return { ts: `2026-01-0${n}`, mode: 'nl', instruction: `edit ${n}`, snapshotBefore: { id: `snap${n}` } }
}

// ── AC1: push 후 스택 top이 새 entry, 순서 유지 ───────────────────────────────

Deno.test('pushEdit: 첫 push 후 스택 top이 새 entry다', () => {
  const tiers = makeTiers()
  const entry = makeEntry(1)
  const result = pushEdit(tiers, entry)
  const stack = result.edit_history
  assertEquals(stack.length, 1)
  assertEquals(stack[0], entry)
})

Deno.test('pushEdit: 여러 push 시 순서(FIFO bottom→top)가 유지된다', () => {
  const tiers = makeTiers()
  const e1 = makeEntry(1)
  const e2 = makeEntry(2)
  const e3 = makeEntry(3)
  const r1 = pushEdit(tiers, e1)
  const r2 = pushEdit(r1, e2)
  const r3 = pushEdit(r2, e3)
  const stack = r3.edit_history
  assertEquals(stack.length, 3)
  assertEquals(stack[0], e1)
  assertEquals(stack[1], e2)
  assertEquals(stack[2], e3)
  // top은 마지막 push
  assertEquals(stack[stack.length - 1], e3)
})

// ── AC2: 20개 초과 push 시 상한 20, 가장 오래된 것부터 drop ──────────────────

Deno.test('pushEdit: 21번째 push 시 스택 길이가 20으로 유지된다', () => {
  let tiers = makeTiers()
  for (let i = 1; i <= 21; i++) tiers = pushEdit(tiers, makeEntry(i))
  assertEquals(tiers.edit_history.length, 20)
})

Deno.test('pushEdit: 상한 초과 시 가장 오래된 entry(bottom)가 제거된다', () => {
  let tiers = makeTiers()
  for (let i = 1; i <= 21; i++) tiers = pushEdit(tiers, makeEntry(i))
  // entry 1이 drop되고 entry 2가 bottom이어야 한다
  assertEquals(tiers.edit_history[0].instruction, 'edit 2')
  // top은 entry 21
  assertEquals(tiers.edit_history[19].instruction, 'edit 21')
})

Deno.test('pushEdit: 정확히 20개는 drop 없이 유지된다', () => {
  let tiers = makeTiers()
  for (let i = 1; i <= 20; i++) tiers = pushEdit(tiers, makeEntry(i))
  assertEquals(tiers.edit_history.length, 20)
  assertEquals(tiers.edit_history[0].instruction, 'edit 1')
})

// ── AC3: undo가 직전 snapshotBefore 복원 + top pop(길이 -1) ──────────────────

Deno.test('undo: top을 pop하고 snapshotBefore를 flow로 반환한다', () => {
  const snap = { id: 'flow-before' }
  const tiers = makeTiers([makeEntry(1), { ts: 't2', mode: 'nl', instruction: 'e2', snapshotBefore: snap }])
  const { tiers: after, flow } = undo(tiers)
  assertEquals(after.edit_history.length, 1)
  assertEquals(flow, snap)
})

Deno.test('undo: pop 후 나머지 스택이 보존된다', () => {
  const e1 = makeEntry(1)
  const tiers = makeTiers([e1, makeEntry(2)])
  const { tiers: after } = undo(tiers)
  assertEquals(after.edit_history.length, 1)
  assertEquals(after.edit_history[0], e1)
})

Deno.test('undo: 연속 undo 시 매번 하나씩 pop된다', () => {
  let tiers = makeTiers([makeEntry(1), makeEntry(2), makeEntry(3)])
  const r1 = undo(tiers)
  assertEquals(r1.tiers.edit_history.length, 2)
  assertEquals(r1.flow, makeEntry(3).snapshotBefore)
  const r2 = undo(r1.tiers)
  assertEquals(r2.tiers.edit_history.length, 1)
})

// ── AC4: 빈 스택 undo는 안전 no-op — 원본 tiers 유지, throw 없음 ──────────────

Deno.test('undo: 빈 edit_history에서 throw 없이 no-op 반환한다', () => {
  const tiers = makeTiers([])
  const { tiers: after, flow } = undo(tiers)
  assertEquals(after.edit_history, [])
  assertEquals(flow, null)
})

Deno.test('undo: 빈 스택 no-op 시 other 필드가 보존된다', () => {
  const tiers = makeTiers([])
  const { tiers: after } = undo(tiers)
  assertEquals(after.other, 'preserved')
})

// ── AC5: edit_history 키 부재를 []로 취급(push/undo 모두 안전) ────────────────

Deno.test('pushEdit: edit_history 키 없는 tiers에서 안전하게 push된다', () => {
  const tiers = { other: 'preserved' }
  const entry = makeEntry(1)
  const result = pushEdit(tiers, entry)
  assertEquals(result.edit_history.length, 1)
  assertEquals(result.edit_history[0], entry)
  assertEquals(result.other, 'preserved')
})

Deno.test('undo: edit_history 키 없는 tiers에서 안전하게 no-op 반환한다', () => {
  const tiers = { other: 'preserved' }
  const { tiers: after, flow } = undo(tiers)
  assertEquals(flow, null)
  assertEquals(after.other, 'preserved')
})

// ── AC6: 입력 tiers 불변(순수) — push/undo가 원본 객체를 변형하지 않음 ─────────

Deno.test('pushEdit: 원본 tiers 객체를 변형하지 않는다', () => {
  const original = makeTiers([makeEntry(1)])
  const originalLength = original.edit_history.length
  const originalRef = original.edit_history
  pushEdit(original, makeEntry(2))
  assertStrictEquals(original.edit_history, originalRef)
  assertEquals(original.edit_history.length, originalLength)
})

Deno.test('undo: 원본 tiers 객체를 변형하지 않는다', () => {
  const original = makeTiers([makeEntry(1), makeEntry(2)])
  const originalLength = original.edit_history.length
  const originalRef = original.edit_history
  undo(original)
  assertStrictEquals(original.edit_history, originalRef)
  assertEquals(original.edit_history.length, originalLength)
})

Deno.test('pushEdit: 반환된 tiers는 원본과 다른 객체다', () => {
  const original = makeTiers()
  const result = pushEdit(original, makeEntry(1))
  // 참조가 달라야 한다
  assertEquals(result === original, false)
})

Deno.test('undo: 반환된 tiers는 원본과 다른 객체다', () => {
  const original = makeTiers([makeEntry(1)])
  const { tiers: after } = undo(original)
  assertEquals(after === original, false)
})

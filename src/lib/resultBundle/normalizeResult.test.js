import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { normalizeResult, normalizeResults } from './normalizeResult.js'

Deno.test('bundle을 덧붙인다', () => {
  const row = { id: 'r1', generation_tiers: { stage1_flow: { node_count: 3 } } }
  const n = normalizeResult(row)
  assertEquals(n.id, 'r1')
  assertEquals(n.bundle.design_stats, { node_count: 3 })
})

Deno.test('원본 generation_tiers를 보존한다 (왕복 무손실·PATCH 병합이 쓴다)', () => {
  const row = { id: 'r1', generation_tiers: { stage1_flow: { node_count: 3 }, 알수없는키: 1 } }
  const n = normalizeResult(row)
  assertEquals(n.generation_tiers, { stage1_flow: { node_count: 3 }, 알수없는키: 1 })
})

Deno.test('generation_tiers가 없어도 bundle은 항상 있다', () => {
  const n = normalizeResult({ id: 'r1' })
  assert(n.bundle)
  assertEquals(n.bundle.esd_schemas, [])
})

Deno.test('null·비객체는 그대로 돌려준다', () => {
  assertEquals(normalizeResult(null), null)
  assertEquals(normalizeResult(undefined), undefined)
})

Deno.test('멱등이다 — 두 번 적용해도 같다', () => {
  const row = { id: 'r1', generation_tiers: { tier1_learned: true } }
  assertEquals(normalizeResult(normalizeResult(row)), normalizeResult(row))
})

Deno.test('normalizeResults는 배열 전체에 적용한다', () => {
  const rows = [{ id: 'a', generation_tiers: { tier1_learned: true } }, { id: 'b' }]
  const n = normalizeResults(rows)
  assertEquals(n.length, 2)
  assertEquals(n[0].bundle.design_ok, true)
  assertEquals(n[1].bundle.design_ok, null)
})

Deno.test('normalizeResults는 배열이 아니면 그대로 둔다', () => {
  assertEquals(normalizeResults(null), null)
  assertEquals(normalizeResults({ error: 'x' }), { error: 'x' })
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { readBundle } from './readBundle.js'

Deno.test('새 이름이 있으면 그대로 읽는다', () => {
  const b = readBundle({ design_stats: { node_count: 7 }, created_by: 'a@b.com' })
  assertEquals(b.design_stats, { node_count: 7 })
  assertEquals(b.created_by, 'a@b.com')
})

Deno.test('구 이름만 있으면 새 이름으로 읽힌다', () => {
  const b = readBundle({ stage1_flow: { node_count: 7 }, tier1_learned: true, tier25_values_filled: 3 })
  assertEquals(b.design_stats, { node_count: 7 })
  assertEquals(b.design_ok, true)
  assertEquals(b.values_filled, 3)
})

Deno.test('새 이름이 구 이름을 이긴다', () => {
  const b = readBundle({ design_stats: { node_count: 9 }, stage1_flow: { node_count: 1 } })
  assertEquals(b.design_stats, { node_count: 9 })
})

Deno.test('없는 키는 계약의 기본값', () => {
  const b = readBundle({})
  assertEquals(b.esd_schemas, [])
  assertEquals(b.api_defs, [])
  assertEquals(b.edit_history, [])
  assertEquals(b.esd, null)
  assertEquals(b.created_by, '')
})

Deno.test('null·undefined 입력도 기본값 번들을 준다', () => {
  assertEquals(readBundle(null).esd_schemas, [])
  assertEquals(readBundle(undefined).esd, null)
})

Deno.test('계약에 없는 키는 보존한다 (미래 생산처 대비)', () => {
  const b = readBundle({ some_future_key: 42 })
  assertEquals(b.some_future_key, 42)
})

Deno.test('버려진 개수 키는 배열 자리를 오염시키지 않는다', () => {
  const b = readBundle({ tier3_rules_executed: 5, tier3_executed_rules: [{ id: 'r1' }] })
  assertEquals(b.rules_executed, [{ id: 'r1' }])
  assertEquals(b.tier3_rules_executed, 5)   // 원본 키는 보존되지만 캐노니컬 자리엔 안 들어간다
})

Deno.test('입력 객체를 변경하지 않는다', () => {
  const input = { stage1_flow: { node_count: 1 } }
  readBundle(input)
  assertEquals(Object.keys(input), ['stage1_flow'])
})

// ── 프로덕션 3세대 픽스처 회귀 (스펙 "테스트 3") ──────────────────────
// 실제 프로덕션 행의 키 모양(값은 축약). 이 폴백이 깨지면 과거 결과 화면이 빈칸이 된다.

const GEN1_2026_05_22 = {
  tier1_learned: true, tier2_structure_count: 1, tier2_field_definitions_loaded: 12,
  tier3_rules_executed: 2, tier3_rules_skipped: 1,
  tier3_executed_rules: [{ rule: 'a' }, { rule: 'b' }], tier3_skipped_rules: [{ rule: 'c' }],
}

const GEN2_2026_06_16 = {
  ...GEN1_2026_05_22, tier3_feature_mapping: { f: 1 },
  flow: { nodes: [] }, stage1_flow: { node_count: 5, llm_calls: 2, repaired: false, reprompted: false },
  tier25_values_filled: 4, esd_schemas: [{ entity: 'member' }], usage: { total_tokens: 100 }, created_by: 'x@y.com',
}

const GEN3_2026_08_14 = {
  ...GEN2_2026_06_16,
  stage29_loop_exit_normalized: 1, stage295_collection_loops: 2, stage3_validation_loops: 3,
  stage35_stripped_condition_nodes: 4, stage36_initialized_accumulators: 5,
  stage365_fallback: 1, stage37_llm_blocks: 2, stage375_api_guard: 1,
  rules_snapshot: { hash: 'abc' }, scenario_examples: { injected: true },
}

Deno.test('1세대(2026-05-22, tier* 만) 폴백', () => {
  const b = readBundle(GEN1_2026_05_22)
  assertEquals(b.design_ok, true)
  assertEquals(b.expand_count, 1)
  assertEquals(b.field_definitions_loaded, 12)
  assertEquals(b.rules_executed, [{ rule: 'a' }, { rule: 'b' }])
  assertEquals(b.rules_skipped, [{ rule: 'c' }])
  assertEquals(b.design_stats, null)   // 아직 없던 키 — 기본값
})

Deno.test('2세대(2026-06-16, flow·stage1_flow 등장) 폴백', () => {
  const b = readBundle(GEN2_2026_06_16)
  assertEquals(b.design_stats, { node_count: 5, llm_calls: 2, repaired: false, reprompted: false })
  assertEquals(b.flow, { nodes: [] })
  assertEquals(b.values_filled, 4)
  assertEquals(b.feature_mapping, { f: 1 })
  assertEquals(b.esd_schemas, [{ entity: 'member' }])
  assertEquals(b.usage, { total_tokens: 100 })
})

Deno.test('3세대(2026-08-14, stage* 다수) 폴백', () => {
  const b = readBundle(GEN3_2026_08_14)
  assertEquals(b.loop_exit_normalized, 1)
  assertEquals(b.collection_loops, 2)
  assertEquals(b.validation_loops, 3)
  assertEquals(b.stripped_condition_nodes, 4)
  assertEquals(b.initialized_accumulators, 5)
  assertEquals(b.fallback_injected, 1)
  assertEquals(b.llm_blocks, 2)
  assertEquals(b.api_guard, 1)
  assertEquals(b.rules_snapshot, { hash: 'abc' })
  assertEquals(b.scenario_examples, { injected: true })
})

// 기존 프로덕션 78행에는 이 키가 없다. 마이그레이션 없이 미보관으로 읽혀야 한다.
Deno.test('archived 키가 없는 옛 행은 false로 읽힌다', () => {
  assertEquals(readBundle({}).archived, false)
  assertEquals(readBundle({ created_by: 'a@b.com' }).archived, false)
})

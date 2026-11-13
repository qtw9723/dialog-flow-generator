import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mergeBundle } from './buildBundle.js'

Deno.test('derive-assets(nlp): nlp를 넣고 nlp_error를 지운다', () => {
  const existing = { created_by: 'a@b.com', nlp_error: '이전 실패' }
  const merged = mergeBundle(existing, { nlp: { intents: [{ name: '예약' }] }, nlp_error: undefined })
  assertEquals(merged.nlp, { intents: [{ name: '예약' }] })
  assertEquals('nlp_error' in merged, false)
  assertEquals(merged.created_by, 'a@b.com')
})

Deno.test('derive-assets(esd): esd_schemas를 갈아끼운다', () => {
  const merged = mergeBundle({ esd_schemas: [{ entity: '구' }] }, { esd_schemas: [{ entity: '신' }] })
  assertEquals(merged.esd_schemas, [{ entity: '신' }])
})

Deno.test('results PATCH: esd=null이면 키를 지운다', () => {
  const merged = mergeBundle({ esd: { entities: [] }, created_by: 'a@b.com' }, { esd: undefined })
  assertEquals('esd' in merged, false)
  assertEquals(merged.created_by, 'a@b.com')
})

Deno.test('results PATCH: 옛 행의 레거시 키를 지우지 않는다', () => {
  const merged = mergeBundle({ tier1_learned: true, stage1_flow: { node_count: 2 } }, { esd: { entities: [] } })
  assertEquals(merged.tier1_learned, true)
  assertEquals(merged.stage1_flow, { node_count: 2 })
})

import { assertEquals, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildBundle, mergeBundle } from './buildBundle.js'

const GENERATED_MIN = {
  flow: { nodes: [] },
  design_stats: { node_count: 1, llm_calls: 1, repaired: false, reprompted: false },
  usage: { total_tokens: 10 },
  created_by: 'a@b.com',
}

Deno.test('생성 프로파일의 최소 번들을 만든다', () => {
  const b = buildBundle('generated', GENERATED_MIN)
  assertEquals(b.created_by, 'a@b.com')
  assertEquals(b.flow, { nodes: [] })
})

Deno.test('선언되지 않은 키는 던진다', () => {
  assertThrows(
    () => buildBundle('generated', { ...GENERATED_MIN, tier1_learned: true }),
    Error,
    'tier1_learned',
  )
})

Deno.test('버려진 개수 키도 선언 밖이므로 던진다', () => {
  assertThrows(() => buildBundle('generated', { ...GENERATED_MIN, tier3_rules_executed: 3 }), Error)
})

Deno.test('필수 키가 빠지면 던진다', () => {
  const { usage: _drop, ...withoutUsage } = GENERATED_MIN
  assertThrows(() => buildBundle('generated', withoutUsage), Error, 'usage')
})

Deno.test('업로드 프로파일은 upload만 있으면 된다', () => {
  const b = buildBundle('upload', { upload: { bot_name: '레스토랑봇' } })
  assertEquals(b.upload, { bot_name: '레스토랑봇' })
  assertEquals(b.created_by, undefined)   // 기본값을 저장하지 않는다
})

Deno.test('모르는 프로파일은 던진다', () => {
  assertThrows(() => buildBundle('nope', {}), Error, 'nope')
})

Deno.test('undefined 값인 키는 결과에서 빠진다', () => {
  const b = buildBundle('generated', { ...GENERATED_MIN, esd: undefined })
  assertEquals('esd' in b, false)
})

Deno.test('기본값을 저장하지 않는다 — 준 키만 나온다', () => {
  const b = buildBundle('generated', GENERATED_MIN)
  assertEquals(Object.keys(b).sort(), ['created_by', 'design_stats', 'flow', 'usage'])
})

Deno.test('mergeBundle은 기존 위에 얹는다', () => {
  const merged = mergeBundle({ created_by: 'a@b.com' }, { nlp: { intents: [] } })
  assertEquals(merged, { created_by: 'a@b.com', nlp: { intents: [] } })
})

Deno.test('mergeBundle의 undefined는 삭제다', () => {
  const merged = mergeBundle({ esd: { x: 1 }, nlp_error: '실패' }, { esd: undefined, nlp_error: undefined })
  assertEquals('esd' in merged, false)
  assertEquals('nlp_error' in merged, false)
})

Deno.test('mergeBundle의 null은 값이다', () => {
  assertEquals(mergeBundle({}, { esd: null }), { esd: null })
})

Deno.test('mergeBundle도 계약 밖 키를 던진다', () => {
  assertThrows(() => mergeBundle({}, { stage1_flow: {} }), Error, 'stage1_flow')
})

Deno.test('mergeBundle은 필수 키를 요구하지 않는다 (부분 갱신)', () => {
  assertEquals(mergeBundle({}, { nlp: { intents: [] } }), { nlp: { intents: [] } })
})

Deno.test('mergeBundle은 기존의 계약 밖 키(옛 행의 레거시 키)를 보존한다', () => {
  const merged = mergeBundle({ tier1_learned: true }, { nlp: { intents: [] } })
  assertEquals(merged.tier1_learned, true)
})

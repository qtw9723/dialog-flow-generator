import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { validateNlpPatch } from './nlpPatch.ts'

Deno.test('nlp 객체를 그대로 통과시킨다', () => {
  const r = validateNlpPatch({ nlp: { intents: [], entities: [] } })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.nlp, { intents: [], entities: [] })
})

Deno.test('nlp가 null이면 키를 지우라는 뜻이라 undefined로 바꾼다', () => {
  const r = validateNlpPatch({ nlp: null })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.nlp, undefined)
})

Deno.test('nlp_error를 함께 받는다', () => {
  const r = validateNlpPatch({ nlp: null, nlp_error: '레이트 리밋' })
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.nlp, undefined)
    assertEquals(r.nlpError, '레이트 리밋')
  }
})

Deno.test('nlp_error가 없으면 undefined — 성공 시 옛 사유가 지워진다', () => {
  const r = validateNlpPatch({ nlp: { intents: [] } })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.nlpError, undefined)
})

Deno.test('nlp가 배열이면 400', () => {
  const r = validateNlpPatch({ nlp: [] })
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error.includes('nlp'), true)
})

Deno.test('nlp가 문자열·숫자여도 400', () => {
  assertEquals(validateNlpPatch({ nlp: 'x' }).ok, false)
  assertEquals(validateNlpPatch({ nlp: 3 }).ok, false)
})

Deno.test('nlp_error가 문자열이 아니면 400', () => {
  const r = validateNlpPatch({ nlp: null, nlp_error: { msg: 'x' } })
  assertEquals(r.ok, false)
})

Deno.test('nlp 키 자체가 없으면 400 — 이 분기는 nlp가 있을 때만 탄다', () => {
  const r = validateNlpPatch({})
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, "nlp가 필요합니다.")
})

Deno.test('esd_error·api_error를 함께 받는다', () => {
  const r = validateNlpPatch({ nlp: null, esd_error: 'ESD 실패', api_error: 'API 실패' })
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.esdError, 'ESD 실패')
    assertEquals(r.apiError, 'API 실패')
  }
})

Deno.test('esd_error·api_error가 없으면 undefined — 성공 시 옛 사유가 지워진다', () => {
  const r = validateNlpPatch({ nlp: null })
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.esdError, undefined)
    assertEquals(r.apiError, undefined)
  }
})

Deno.test('esd_error가 문자열이 아니면 400', () => {
  const r = validateNlpPatch({ nlp: null, esd_error: { msg: 'x' } })
  assertEquals(r.ok, false)
})

Deno.test('api_error가 문자열이 아니면 400', () => {
  const r = validateNlpPatch({ nlp: null, api_error: 42 })
  assertEquals(r.ok, false)
})

Deno.test('esd_error·api_error 키를 안 넘기면 nlp·nlp_error 결과가 이전과 글자 그대로 같다', () => {
  const withoutKeys = validateNlpPatch({ nlp: null, nlp_error: '레이트 리밋' })
  assertEquals(withoutKeys.ok, true)
  if (withoutKeys.ok) {
    assertEquals(withoutKeys.nlp, undefined)
    assertEquals(withoutKeys.nlpError, '레이트 리밋')
    assertEquals(withoutKeys.esdError, undefined)
    assertEquals(withoutKeys.apiError, undefined)
  }
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { derivationErrors } from './derivationErrors.js'

Deno.test('사유가 없으면 빈 배열', () => {
  assertEquals(derivationErrors({ nlp: { intents: [] } }), [])
})

Deno.test('사유 하나면 한 줄', () => {
  const r = derivationErrors({ nlp_error: '레이트 리밋' })
  assertEquals(r.length, 1)
  assertEquals(r[0].key, 'nlp_error')
  assertEquals(r[0].reason, '레이트 리밋')
})

Deno.test('성공 키가 있으면 그 줄을 뺀다 — nlp가 있으면 nlp_error는 무시', () => {
  assertEquals(derivationErrors({ nlp: { intents: [] }, nlp_error: '옛 사유' }), [])
})

Deno.test('ESD·API는 일부만 성공할 수 있어 성공 키가 있어도 사유를 보인다', () => {
  const r = derivationErrors({ esd_schemas: [{ entity: 'a' }], esd_error: '타입 추론 실패' })
  assertEquals(r.length, 1)
  assertEquals(r[0].key, 'esd_error')
})

Deno.test('셋 다 있으면 NLP·ESD·API 순서로 낸다', () => {
  const r = derivationErrors({ api_error: 'c', esd_error: 'b', nlp_error: 'a' })
  assertEquals(r.map((e) => e.key), ['nlp_error', 'esd_error', 'api_error'])
})

Deno.test('라벨이 키마다 다르고 모듈이 단일 소스다', () => {
  const r = derivationErrors({ nlp_error: 'a', esd_error: 'b', api_error: 'c' })
  const labels = r.map((e) => e.label)
  assertEquals(new Set(labels).size, 3)
  // 구현이 읽는 상수를 되읽지 않도록 실제 표시 문구(리터럴)와 비교해 고정한다.
  assertEquals(labels[0], 'NLP 학습 데이터')
})

Deno.test('번들이 null·undefined·원시값이어도 던지지 않는다', () => {
  assertEquals(derivationErrors(null), [])
  assertEquals(derivationErrors(undefined), [])
  assertEquals(derivationErrors(3), [])
})

Deno.test('사유가 빈 문자열·공백이면 줄을 만들지 않는다', () => {
  assertEquals(derivationErrors({ nlp_error: '' }), [])
  assertEquals(derivationErrors({ nlp_error: '   ' }), [])
})

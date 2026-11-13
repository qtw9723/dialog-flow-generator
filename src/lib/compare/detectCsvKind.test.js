import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { detectCsvKind, CSV_KIND_LABELS } from './detectCsvKind.js'
import { parseCsv } from './parseCsv.js'

Deno.test('intents: 헤더가 정확히 intent·example', () => {
  const r = detectCsvKind(['intent', 'example'])
  assertEquals(r.kind, 'intents')
  assertEquals(r.keyIndexes, [0, 1])
  assertEquals(r.setIndexes, [])
})

Deno.test('intents: 대소문자·앞뒤 공백을 무시한다', () => {
  assertEquals(detectCsvKind([' Intent ', 'EXAMPLE']).kind, 'intents')
})

Deno.test('intents: 컬럼이 더 있으면 intents가 아니다', () => {
  assertEquals(detectCsvKind(['intent', 'example', 'note']).kind, 'unknown')
})

Deno.test('entities: 앞 4개가 규격이면 동의어는 3번부터 끝까지 집합이다', () => {
  const headers = ['entity', 'value', 'type', 'synonyms', '', '', '', '', '', '', '', '', '']
  const r = detectCsvKind(headers)
  assertEquals(r.kind, 'entities')
  assertEquals(r.keyIndexes, [0, 1])
  assertEquals(r.setIndexes, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

Deno.test('esd: 마지막 두 헤더가 createdAt·updatedAt', () => {
  const r = detectCsvKind(['name', 'price', 'createdAt', 'updatedAt'])
  assertEquals(r.kind, 'esd')
  assertEquals(r.keyIndexes, [0])
  assertEquals(r.setIndexes, [])
})

Deno.test('esd: 꼬리 두 개뿐이면 키로 쓸 컬럼이 없으므로 esd가 아니다', () => {
  assertEquals(detectCsvKind(['createdAt', 'updatedAt']).kind, 'unknown')
})

Deno.test('unknown: 기본 키는 첫 컬럼', () => {
  const r = detectCsvKind(['가', '나', '다'])
  assertEquals(r.kind, 'unknown')
  assertEquals(r.keyIndexes, [0])
})

Deno.test('unknown: 헤더가 없으면 키도 없다', () => {
  assertEquals(detectCsvKind([]).keyIndexes, [])
})

Deno.test('label: 모든 kind에 한국어 이름이 있다', () => {
  for (const kind of ['intents', 'entities', 'esd', 'unknown']) {
    assertEquals(typeof CSV_KIND_LABELS[kind], 'string')
    assertEquals(CSV_KIND_LABELS[kind].length > 0, true)
  }
  assertEquals(detectCsvKind(['intent', 'example']).label, CSV_KIND_LABELS.intents)
})

Deno.test('실측: 픽스처 두 개가 각각 intents·entities로 잡힌다', async () => {
  const intents = parseCsv(await Deno.readTextFile('docs/superpowers/fixtures/sample-intents.csv'))
  assertEquals(detectCsvKind(intents.headers).kind, 'intents')

  const entities = parseCsv(await Deno.readTextFile('docs/superpowers/fixtures/sample-entities.csv'))
  const r = detectCsvKind(entities.headers)
  assertEquals(r.kind, 'entities')
  assertEquals(r.setIndexes.length, 10)
})

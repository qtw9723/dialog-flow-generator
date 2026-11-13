import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { esdFromDocuments } from "./esdFromDocuments.js"

const SAMPLE_SHEET = {
  schemaName: 'reservation',
  headers: ['예약번호', '고객명', '수량', 'createdAt'],
  rows: [
    { 예약번호: 'R1', 고객명: '홍길동', 수량: '1', createdAt: '2026-01-01' },
    { 예약번호: 'R2', 고객명: '이순신', 수량: '2', createdAt: '2026-01-02' },
  ],
}

const SAMPLE_API = { id: 'api-1', method: 'GET', path: '/test' }

Deno.test('AC1: 엑셀 시트만 → entities 있고 apis 빈 배열', () => {
  const result = esdFromDocuments({ sheets: [SAMPLE_SHEET], apis: [] })
  assertEquals(result.apis, [])
  assertEquals(result.entities.length, 1)
  const schema = result.entities[0]
  assertEquals(schema.name, 'reservation')
  assertEquals(schema.createdBy, 'DialogFlow Generator')
  // 예약 타임스탬프(createdAt) 열 제외됨
  assertEquals(schema.fields.map((f) => f.name), ['예약번호', '고객명', '수량'])
})

Deno.test('AC1: 타입·키 추론이 반영됨', () => {
  const result = esdFromDocuments({ sheets: [SAMPLE_SHEET] })
  const schema = result.entities[0]
  const byName = Object.fromEntries(schema.fields.map((f) => [f.name, f]))
  assertEquals(byName['수량'].type, 'number')
  assertEquals(byName['예약번호'].key, true)
  assertEquals(byName['고객명'].crypt, 'true')
})

Deno.test('AC1: buildEsdSchema 최상위 키 집합 준수', () => {
  const result = esdFromDocuments({ sheets: [SAMPLE_SHEET] })
  assertEquals(Object.keys(result.entities[0]), [
    'name', 'description', 'tags', 'createdBy', 'createdAt',
    'fields', 'resultSamples', 'retentionPeriod', 'criteriaField',
  ])
})

Deno.test('AC2: api_def만 → entities 빈 배열, apis 보존', () => {
  const result = esdFromDocuments({ sheets: [], apis: [SAMPLE_API] })
  assertEquals(result.entities, [])
  assertEquals(result.apis, [SAMPLE_API])
})

Deno.test('AC3: 둘 다 → entities·apis 모두 반환', () => {
  const result = esdFromDocuments({ sheets: [SAMPLE_SHEET], apis: [SAMPLE_API] })
  assertEquals(result.entities.length, 1)
  assertEquals(result.entities[0].name, 'reservation')
  assertEquals(result.apis, [SAMPLE_API])
})

Deno.test('AC4: 빈 입력({}) → throw 없이 빈 결과', () => {
  assertEquals(esdFromDocuments({}), { entities: [], apis: [] })
})

Deno.test('AC4: 인자 없이 호출 → throw 없이 빈 결과', () => {
  assertEquals(esdFromDocuments(), { entities: [], apis: [] })
})

Deno.test('AC4: sheets만 빈 배열 → entities 없음', () => {
  assertEquals(esdFromDocuments({ sheets: [] }), { entities: [], apis: [] })
})

Deno.test('T4-AC1: 명시 createdAt 주입 시 엔티티의 createdAt이 그 값 그대로', () => {
  const fixedAt = '2026-07-31T00:00:00.000Z'
  const result = esdFromDocuments({ sheets: [SAMPLE_SHEET], createdAt: fixedAt })
  assertEquals(result.entities.length, 1)
  assertEquals(result.entities[0].createdAt, fixedAt)
})

Deno.test('T4-AC1: createdAt 미제공 시 엔티티 조립 정상(throw 없음)', () => {
  const result = esdFromDocuments({ sheets: [SAMPLE_SHEET] })
  assertEquals(result.entities.length, 1)
  assertEquals(typeof result.entities[0].createdAt, 'string')
})

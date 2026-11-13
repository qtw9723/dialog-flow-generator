import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildCoverage } from './buildCoverage.ts'

const TABLES = [{ name: '표 1', headerRow: ['시나리오', '비고'], rowCount: 3 }]

Deno.test('매핑된 열과 버려진 열을 나눈다', () => {
  const c = buildCoverage({
    tables: TABLES,
    columnMapping: [{ column: '시나리오', field: '시나리오 이름', source: 'user' }],
    scenarios: [{ '시나리오 이름': '배송조회' }],
  })
  assertEquals(c.columnMapping.find((m) => m.column === '시나리오').mappedTo, '시나리오 이름')
  assertEquals(c.unmappedColumns, ['비고'])
})

Deno.test('매핑이 전혀 없으면 모든 열이 unmapped', () => {
  const c = buildCoverage({ tables: TABLES, columnMapping: [], scenarios: [] })
  assertEquals(c.unmappedColumns, ['시나리오', '비고'])
  assertEquals(c.columnMapping.every((m) => m.mappedTo === null && m.source === 'none'), true)
})

Deno.test('시나리오 이름을 기록한다', () => {
  const c = buildCoverage({ tables: TABLES, columnMapping: [],
    scenarios: [{ '시나리오 이름': 'A' }, { '시나리오 이름': 'B' }] })
  assertEquals(c.scenarios, [{ name: 'A' }, { name: 'B' }])
})

Deno.test('표 요약을 그대로 담는다', () => {
  assertEquals(buildCoverage({ tables: TABLES, columnMapping: [], scenarios: [] }).tables, TABLES)
})

Deno.test('버려진 열이 있으면 notes에 남긴다', () => {
  const c = buildCoverage({ tables: TABLES, columnMapping: [], scenarios: [] })
  assertEquals(c.notes.length > 0, true)
  assertEquals(c.notes[0].includes('반영되지 않았습니다'), true, c.notes[0])
})

Deno.test('버려진 열이 없으면 notes가 비어 있다', () => {
  const c = buildCoverage({
    tables: [{ name: 'T', headerRow: ['시나리오'], rowCount: 1 }],
    columnMapping: [{ column: '시나리오', field: '시나리오 이름', source: 'dictionary' }],
    scenarios: [],
  })
  assertEquals(c.notes, [])
  assertEquals(c.columnMapping[0].source, 'dictionary')
})

Deno.test('표가 없으면 빈 구조 — 던지지 않는다', () => {
  const c = buildCoverage({ tables: [], columnMapping: [], scenarios: [] })
  assertEquals(c.tables, []); assertEquals(c.unmappedColumns, []); assertEquals(c.notes, [])
})

Deno.test('인자가 없어도 던지지 않는다', () => {
  const c = buildCoverage({})
  assertEquals(c.tables, []); assertEquals(c.scenarios, [])
})

// source 고정 — 커버리지가 "누가 이 매핑을 정했나"를 잘못 말하면 학습·신뢰 판단이 어긋난다.
Deno.test("source: 'dictionary'는 그대로 기록된다 — 사전이 자동으로 맞힌 열", () => {
  const c = buildCoverage({
    tables: TABLES,
    columnMapping: [{ column: '시나리오', field: '시나리오 이름', source: 'dictionary' }],
    scenarios: [],
  })
  assertEquals(c.columnMapping.find((m) => m.column === '시나리오').source, 'dictionary')
})

Deno.test("source: 'user'는 그대로 기록된다 — 사람이 직접 고친 열", () => {
  const c = buildCoverage({
    tables: TABLES,
    columnMapping: [{ column: '시나리오', field: '분기', source: 'user' }],
    scenarios: [],
  })
  assertEquals(c.columnMapping.find((m) => m.column === '시나리오').source, 'user')
})

Deno.test("source가 없는 매핑은 'user'로 본다 — 'none'(매핑 없음)과 구분돼야 한다", () => {
  const c = buildCoverage({
    tables: TABLES,
    columnMapping: [{ column: '시나리오', field: '시나리오 이름' }],
    scenarios: [],
  })
  const hit = c.columnMapping.find((m) => m.column === '시나리오')
  assertEquals(hit.source, 'user')
  // 매핑이 있는 열은 절대 'none'이 아니다 — 'none'은 "아무도 이 열을 대응시키지 않았다"는 뜻이다.
  assertEquals(hit.source === 'none', false)
  assertEquals(c.columnMapping.find((m) => m.column === '비고').source, 'none')
})

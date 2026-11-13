import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { assembleFromClassified } from "./assembleFromClassified.js"

const FIXED_AT = '2026-07-31T00:00:00.000Z'

const SAMPLE_SHEET = {
  schemaName: 'reservation',
  headers: ['예약번호', '고객명', '수량'],
  rows: [
    { 예약번호: 'R1', 고객명: '홍길동', 수량: '1' },
  ],
}

const SAMPLE_API_DEF = { id: 'api-1', method: 'GET', path: '/reservation' }

const SAMPLE_SCENARIO_DOC = {
  botName: '테스트봇',
  personality: '친절한',
  scenarios: [{ name: '예약', trigger: '예약해줘' }],
}

Deno.test('AC1: esd 시트만 → sessionEsd.entities 채움, scenarioDraft === null', () => {
  const result = assembleFromClassified({ esdSheets: [SAMPLE_SHEET], createdAt: FIXED_AT })
  assertExists(result.sessionEsd)
  assertEquals(result.sessionEsd.entities.length, 1)
  assertEquals(result.sessionEsd.entities[0].name, 'reservation')
  assertEquals(result.sessionEsd.entities[0].createdAt, FIXED_AT)
  assertEquals(result.sessionEsd.apis, [])
  assertEquals(result.scenarioDraft, null)
})

Deno.test('AC2: api defs만 → sessionEsd.apis 채움(entities 빈 배열), scenarioDraft === null', () => {
  const result = assembleFromClassified({ apiDefs: [SAMPLE_API_DEF] })
  assertExists(result.sessionEsd)
  assertEquals(result.sessionEsd.entities, [])
  assertEquals(result.sessionEsd.apis, [SAMPLE_API_DEF])
  assertEquals(result.scenarioDraft, null)
})

Deno.test('AC3: esd + api 혼합 → entities와 apis 둘 다 채움', () => {
  const result = assembleFromClassified({
    esdSheets: [SAMPLE_SHEET],
    apiDefs: [SAMPLE_API_DEF],
    createdAt: FIXED_AT,
  })
  assertExists(result.sessionEsd)
  assertEquals(result.sessionEsd.entities.length, 1)
  assertEquals(result.sessionEsd.apis, [SAMPLE_API_DEF])
  assertEquals(result.scenarioDraft, null)
})

Deno.test('AC4: scenario docs만 → sessionEsd === null, scenarioDraft.scenarios 병합', () => {
  const doc2 = { scenarios: [{ name: '문의', trigger: '문의해줘' }] }
  const result = assembleFromClassified({ scenarioDocs: [SAMPLE_SCENARIO_DOC, doc2] })
  assertEquals(result.sessionEsd, null)
  assertExists(result.scenarioDraft)
  assertEquals(result.scenarioDraft.scenarios.length, 2)
  assertEquals(result.scenarioDraft.botName, '테스트봇')
  assertEquals(result.scenarioDraft.personality, '친절한')
})

Deno.test('AC4-b: botName/personality 최초 비어있지-않은 값 채택', () => {
  const doc1 = { scenarios: [{ name: 'A' }] }
  const doc2 = { botName: '첫봇', personality: '엄격한', scenarios: [{ name: 'B' }] }
  const doc3 = { botName: '두번째봇', scenarios: [{ name: 'C' }] }
  const result = assembleFromClassified({ scenarioDocs: [doc1, doc2, doc3] })
  assertEquals(result.scenarioDraft.botName, '첫봇')
  assertEquals(result.scenarioDraft.personality, '엄격한')
  assertEquals(result.scenarioDraft.scenarios.length, 3)
})

Deno.test('AC5: 빈 입력 {} → sessionEsd null, scenarioDraft null, throw 금지', () => {
  assertEquals(assembleFromClassified({}), { sessionEsd: null, scenarioDraft: null })
})

Deno.test('AC5: 인자 없이 호출 → throw 금지', () => {
  assertEquals(assembleFromClassified(), { sessionEsd: null, scenarioDraft: null })
})

Deno.test('AC6: sessionEsd 출력이 esdFromDocuments 구조와 일치 (entities·apis 최상위 키)', () => {
  const result = assembleFromClassified({ esdSheets: [SAMPLE_SHEET], createdAt: FIXED_AT })
  const keys = Object.keys(result.sessionEsd).sort()
  assertEquals(keys, ['apis', 'entities'].sort())
})

Deno.test('AC6-b: esd 없이 apiDefs만 있어도 sessionEsd 생성', () => {
  const result = assembleFromClassified({ apiDefs: [SAMPLE_API_DEF, { id: 'api-2', method: 'POST', path: '/order' }] })
  assertExists(result.sessionEsd)
  assertEquals(result.sessionEsd.apis.length, 2)
  assertEquals(result.sessionEsd.entities, [])
})

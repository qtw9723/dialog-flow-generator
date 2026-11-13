import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { walk } from '../flow/flowToScenarios.js'
import { scenarioSubtreeIds, scenarioAssetsAt, assetCounts } from './scenarioAssets.js'

// 시나리오 2개(예약·주문) + greeting/fallback. 각 시나리오가 자기 자산만 가져야 한다.
// r1loop→ae, r1inner→r2 는 일부러 넣은 경계-교차 간선이다(플로우가 실무에서 실제로 만드는
// 폴백/핸드오프 형태) — stopAt이 없으면 r1의 서브트리가 다른 루트로 새는지를 검증하려는 것.
const flow = {
  dialogs: [{ id: 'main', then: ['w', 'r1', 'r2', 'ae'], nodes: [
    { id: 'w', type: 'greeting', then: ['wOut'] },
    { id: 'wOut', type: 'esd', then: [], config: { query: { schemaName: '인사로그' } } },
    { id: 'ae', type: 'fallback', then: ['aeApi'] },
    { id: 'aeApi', type: 'api', then: [], config: { apiName: 'fallback_api' } },

    { id: 'r1', type: 'node', condition: 'intent("예약")', then: ['r1esd', 'r1loop'] },
    { id: 'r1esd', type: 'esd', then: [], config: { query: { schemaName: '예약' } } },
    // 경계-교차 간선 1: fallback로의 폴백 넘김
    { id: 'r1loop', type: 'subflow', then: ['ae'], body: ['r1inner'] },
    // 루프 body 자식도 서브트리다 — then만 따라가면 이 자산을 놓친다.
    // 경계-교차 간선 2: 다른 시나리오 루트로의 핸드오프
    { id: 'r1inner', type: 'api', condition: 'entity("인원수") && entities("시간추가")', then: ['r2'], config: { apiName: '예약API' } },

    { id: 'r2', type: 'node', condition: 'intent("주문")', then: ['r2esd'] },
    // 구버전 경로: config.schemaName (config.query.schemaName이 아니다)
    { id: 'r2esd', type: 'esd', then: [], config: { schemaName: '주문' } },
  ] }],
}

const bundle = {
  esd_schemas: [{ name: '예약' }, { name: '주문' }, { name: '인사로그' }],
  api_defs: [{ name: '예약API' }, { name: 'fallback_api' }],
  nlp: {
    intents: [{ name: '예약', examples: ['예약할래'] }, { name: '주문', examples: ['주문할래'] }],
    entities: [{ name: '인원수', values: [] }, { name: '시간추가', values: [] }, { name: '메뉴', values: [] }],
  },
}

Deno.test('서브트리는 then과 body를 모두 따라간다', () => {
  assertEquals(scenarioSubtreeIds(flow, 0).sort(), ['r1', 'r1esd', 'r1inner', 'r1loop'])
})

Deno.test('과대 귀속 금지: 다른 시나리오·fallback 자산이 섞이지 않는다', () => {
  const a = scenarioAssetsAt(flow, bundle, 0)
  assertEquals(a.esd_schemas.map((s) => s.name), ['예약'])
  assertEquals(a.api_defs.map((d) => d.name), ['예약API'])
  assertEquals(a.nlp.entities.map((e) => e.name), ['인원수', '시간추가'])
})

Deno.test('ESD 귀속: config.query.schemaName과 config.schemaName 두 경로 모두', () => {
  assertEquals(scenarioAssetsAt(flow, bundle, 0).esd_schemas.map((s) => s.name), ['예약'])
  assertEquals(scenarioAssetsAt(flow, bundle, 1).esd_schemas.map((s) => s.name), ['주문'])
})

// ── 인텐트 귀속 ─────────────────────────────────────────────────────────
// ⚠ 위치가 아니라 **이름**으로 맞춘다. bundle.nlp.intents의 순서는 설문 응답 순서
// (dialogflow-generator의 collectScenarioDetails)이고 index는 main.then의 자리라 서로 다르다.

Deno.test('인텐트 귀속: bundle.scenarios가 있으면 이름으로 맞춘다', () => {
  const named = { ...bundle, scenarios: { r1: '예약', r2: '주문' } }
  assertEquals(scenarioAssetsAt(flow, named, 0).nlp.intents.map((i) => i.name), ['예약'])
  assertEquals(scenarioAssetsAt(flow, named, 1).nlp.intents.map((i) => i.name), ['주문'])
})

Deno.test('회귀: 루트 순서와 인텐트 배열 순서가 어긋나도 각 시나리오가 자기 인텐트를 받는다', () => {
  // 루트 순서는 r1(예약) → r2(주문)인데, 인텐트 배열은 설문 순서라 주문이 먼저 들어 있다.
  // 위치 기반 조회면 시나리오 0(예약)에 '주문' 인텐트가 붙어 봇이 런타임에 진입 불가가 된다.
  const skewed = {
    ...bundle,
    scenarios: { r1: '예약', r2: '주문' },
    nlp: {
      intents: [{ name: '주문', examples: ['주문할래'] }, { name: '예약', examples: ['예약할래'] }],
      entities: bundle.nlp.entities,
    },
  }
  assertEquals(scenarioAssetsAt(flow, skewed, 0).nlp.intents.map((i) => i.name), ['예약'])
  assertEquals(scenarioAssetsAt(flow, skewed, 1).nlp.intents.map((i) => i.name), ['주문'])
})

Deno.test('인텐트 귀속: 시나리오명은 intentNameOf 규칙을 거쳐 맞춘다', () => {
  // 시나리오명 "매장 정보!" → 인텐트명 "매장정보"(공백·기호 제거).
  const f = {
    dialogs: [{ id: 'main', then: ['r'], nodes: [{ id: 'r', type: 'node', then: [] }] }],
  }
  const b = {
    scenarios: { r: '매장 정보!' },
    nlp: { intents: [{ name: '매장정보', examples: [] }], entities: [] },
  }
  assertEquals(scenarioAssetsAt(f, b, 0).nlp.intents.map((i) => i.name), ['매장정보'])
})

Deno.test('인텐트 귀속: 이름이 맞는 인텐트가 없으면 빈 배열 — 남의 인텐트를 끌어오지 않는다', () => {
  // 조립물(assembled)에서 실제로 나는 모양: mergeScenarioAssets가 인텐트 없는 자산도 통과시켜
  // 인텐트 개수 < 시나리오 개수가 된다. 위치 기반이면 여기서 옆 시나리오 인텐트가 새어든다.
  const named = {
    ...bundle,
    scenarios: { r1: '예약', r2: '주문' },
    nlp: { intents: [{ name: '주문', examples: [] }], entities: bundle.nlp.entities },
  }
  assertEquals(scenarioAssetsAt(flow, named, 0).nlp.intents, [])
  assertEquals(scenarioAssetsAt(flow, named, 1).nlp.intents.map((i) => i.name), ['주문'])
})

Deno.test('인텐트 귀속: bundle.scenarios가 없는 레거시 행은 위치 폴백', () => {
  // bundle.scenarios가 생기기 전 행이 프로덕션에 남아 있다 — 그때는 위치가 유일한 단서다.
  assertEquals(scenarioAssetsAt(flow, bundle, 0).nlp.intents.map((i) => i.name), ['예약'])
  assertEquals(scenarioAssetsAt(flow, bundle, 1).nlp.intents.map((i) => i.name), ['주문'])
})

Deno.test('인텐트 귀속: 이 루트만 bundle.scenarios에 없으면 위치 폴백', () => {
  const partial = { ...bundle, scenarios: { r2: '주문' } }
  assertEquals(scenarioAssetsAt(flow, partial, 0).nlp.intents.map((i) => i.name), ['예약'])
})

Deno.test('인텐트 귀속: 정규화하면 빈 이름이 되는 시나리오명도 위치 폴백', () => {
  const junk = { ...bundle, scenarios: { r1: '///', r2: '주문' } }
  assertEquals(scenarioAssetsAt(flow, junk, 0).nlp.intents.map((i) => i.name), ['예약'])
})

Deno.test('엔티티 귀속: entity()·entities() 두 표기, 콜론 뒤 값은 떼어낸다', () => {
  const f = {
    dialogs: [{ id: 'main', then: ['r'], nodes: [
      { id: 'r', type: 'node', condition: 'entity("카드종류:신용카드")', then: [] },
    ] }],
  }
  const b = { nlp: { intents: [], entities: [{ name: '카드종류', values: [] }] } }
  assertEquals(scenarioAssetsAt(f, b, 0).nlp.entities.map((e) => e.name), ['카드종류'])
})

Deno.test('번들에 없는 이름은 버린다', () => {
  const f = {
    dialogs: [{ id: 'main', then: ['r'], nodes: [
      { id: 'r', type: 'api', then: [], config: { apiName: '없는API' } },
    ] }],
  }
  assertEquals(scenarioAssetsAt(f, bundle, 0).api_defs, [])
})

Deno.test('자산 0건 시나리오도 빈 배열로 돌아온다(등록을 막지 않는다)', () => {
  const f = {
    dialogs: [{ id: 'main', then: ['r'], nodes: [
      { id: 'r', type: 'output', then: [], config: { items: [] } },
    ] }],
  }
  const a = scenarioAssetsAt(f, { esd_schemas: [], api_defs: [], nlp: null }, 0)
  assertEquals(a, { esd_schemas: [], nlp: { intents: [], entities: [] }, api_defs: [] })
  assertEquals(assetCounts(a), { esd: 0, intents: 0, entities: 0, api: 0 })
})

Deno.test('범위 밖 인덱스·빈 flow는 빈 자산', () => {
  assertEquals(scenarioSubtreeIds(flow, 9), [])
  assertEquals(scenarioAssetsAt(null, null, 0).esd_schemas, [])
})

Deno.test('assetCounts: 개수를 센다', () => {
  assertEquals(assetCounts(scenarioAssetsAt(flow, bundle, 0)), { esd: 1, intents: 1, entities: 2, api: 1 })
})

Deno.test('stopAt이 실제로 일을 한다: 없으면 다른 루트로 넘어간다', () => {
  const byId = new Map()
  for (const d of flow.dialogs) for (const n of d.nodes) byId.set(n.id, n)
  const unguarded = walk('r1', byId)          // stopAt 없이 — flowToScenarios가 하는 호출
  assertEquals(unguarded.includes('r2'), true, '픽스처가 경계를 넘는 간선을 갖고 있어야 이 테스트가 의미 있다')
  assertEquals(unguarded.includes('ae'), true)
  assertEquals(scenarioSubtreeIds(flow, 0).includes('r2'), false)
  assertEquals(scenarioSubtreeIds(flow, 0).includes('ae'), false)
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { flowToScenarios, triggerFromCondition, walk, scenarioRootIds, boilerplateRootIds } from './flowToScenarios.js'

const load = async (n) => JSON.parse(await Deno.readTextFile(`docs/superpowers/fixtures/bots/${n}.json`))

Deno.test('triggerFromCondition: intent()에서 인텐트명', () => {
  assertEquals(triggerFromCondition('intent("예약하기")'), '예약하기')
  assertEquals(triggerFromCondition("intents('배송조회', 0.4)"), '배송조회')
})

Deno.test('triggerFromCondition: input.text 매칭에서 발화', () => {
  assertEquals(triggerFromCondition("input.text.includes('예약할래')"), '예약할래')
  assertEquals(triggerFromCondition('input.text == "메뉴"'), '메뉴')
})

Deno.test('triggerFromCondition: entity()도 읽는다', () => {
  assertEquals(triggerFromCondition('entity("카드종류:신용카드")'), '카드종류:신용카드')
})

Deno.test('triggerFromCondition: 빈 값·모르는 형태는 빈 문자열', () => {
  for (const c of ['', null, undefined, '_result != null', 'local.x == 1']) {
    assertEquals(triggerFromCondition(c), '')
  }
})

const flow = {
  id: 'b', name: 'b',
  dialogs: [{ id: 'main', then: ['w', 's1', 'ae'], nodes: [
    { id: 'w', type: 'greeting', then: [] },
    { id: 'ae', type: 'fallback', then: [] },
    { id: 's1', type: 'node', label: '예약 진입', condition: 'intent("예약하기")', then: ['ask'] },
    { id: 'ask', type: 'output', then: ['cap'], config: { items: [{ text: [{ texts: ['날짜를 알려주세요'] }] }] } },
    { id: 'cap', type: 'set', then: ['br'], config: { items: [{ key: 'local.date', value: 'input.text' }] } },
    { id: 'br', type: 'node', label: '분기', then: ['ok', 'no'] },
    { id: 'ok', type: 'output', label: '성공', condition: 'entity("확인:예")', then: [], config: { items: [{ text: [{ texts: ['예약됐습니다'] }] }] } },
    { id: 'no', type: 'output', label: '실패', condition: '', then: [], config: { items: [] } },
  ] }],
}

Deno.test('greeting·fallback는 시나리오가 아니다', () => {
  const s = flowToScenarios(flow)
  assertEquals(s.length, 1)
  assertEquals(s[0].name, '예약하기')
})

Deno.test('수집 항목을 set 노드에서 뽑고 scope 접두사를 뗀다', () => {
  assertEquals(flowToScenarios(flow)[0].collects, ['date'])
})

Deno.test('분기 자식의 조건을 갈림길 설명으로 모은다(조건 없는 갈래는 제외)', () => {
  const b = flowToScenarios(flow)[0].branches
  assertEquals(b.length, 1)
  assertEquals(b[0], 'entity("확인:예") → 성공')
})

Deno.test('완료 결과는 마지막 멘트', () => {
  assertEquals(flowToScenarios(flow)[0].result, '예약됐습니다')
})

Deno.test('번들 시나리오명이 있으면 우선한다', () => {
  const s = flowToScenarios(flow, { scenarioNames: { s1: '매장 예약' } })
  assertEquals(s[0].name, '매장 예약')
  assertEquals(s[0].trigger, '예약하기')
})

Deno.test('조건도 이름도 없으면 라벨, 그것도 없으면 id', () => {
  const f = { dialogs: [{ id: 'main', then: ['x', 'y'], nodes: [
    { id: 'x', type: 'node', label: '문의 처리', then: [] },
    { id: 'y', type: 'node', label: '', then: [] },
  ] }] }
  const s = flowToScenarios(f)
  assertEquals(s[0].name, '문의 처리')
  assertEquals(s[1].name, 'y')
})

Deno.test('main이 없으면 빈 배열', () => {
  assertEquals(flowToScenarios({ dialogs: [{ id: 'sub', nodes: [] }] }), [])
  assertEquals(flowToScenarios(null), [])
})

// ── 실제 봇 ─────────────────────────────────────────────────────────────

Deno.test('fixture 4종: throw 없이 처리되고 shape이 일정하다', async () => {
  for (const f of ['node-sample', 'llm-sample']) {
    for (const x of flowToScenarios(await load(f))) {
      assertEquals(typeof x.name, 'string')
      assertEquals(typeof x.trigger, 'string')
      assertEquals(Array.isArray(x.collects), true)
      assertEquals(Array.isArray(x.branches), true)
      assertEquals(typeof x.result, 'string')
    }
  }
})

Deno.test('scenarioRootIds: greeting·fallback를 빼고 순서를 보존한다', () => {
  assertEquals(scenarioRootIds(flow), ['s1'])
  const two = {
    dialogs: [{ id: 'main', then: ['w', 'b', 'a', 'ae', 'ghost'], nodes: [
      { id: 'w', type: 'greeting', then: [] },
      { id: 'ae', type: 'fallback', then: [] },
      { id: 'b', type: 'node', then: [] },
      { id: 'a', type: 'node', then: [] },
    ] }],
  }
  // then의 순서 그대로 — 이름순이 아니다. 'ghost'는 노드가 없어 빠진다.
  assertEquals(scenarioRootIds(two), ['b', 'a'])
})

Deno.test('scenarioRootIds: i번째 루트가 flowToScenarios의 i번째 시나리오다', () => {
  // 옛 버전은 length만 비교해 **절대 실패할 수 없었다**(flowToScenarios가 scenarioRootIds를
  // 순회하며 반복마다 정확히 하나 push하므로 길이는 어떤 입력에서도 같다).
  // 대응이 실제로 어긋날 수 있는 축은 **어느 루트가 어느 이름을 받는지**다 — scenarioNames로
  // id 순서·then 순서와 다른 이름 순서를 주고 짝이 맞는지 본다.
  const f = {
    dialogs: [{ id: 'main', then: ['w', 'z', 'a', 'm', 'ae'], nodes: [
      { id: 'w', type: 'greeting', then: [] },
      { id: 'ae', type: 'fallback', then: [] },
      { id: 'z', type: 'node', label: '라벨Z', then: [] },
      { id: 'a', type: 'node', label: '라벨A', then: [] },
      { id: 'm', type: 'node', label: '라벨M', then: [] },
    ] }],
  }
  // 이름 순서(가나다/하하하/바바바)는 then 순서(z,a,m)와도, 알파벳 순서와도 다르다.
  const scenarioNames = { z: '하하하', a: '가나다', m: '바바바' }
  const roots = scenarioRootIds(f)
  const scen = flowToScenarios(f, { scenarioNames })
  assertEquals(roots, ['z', 'a', 'm'])
  assertEquals(roots.length, scen.length)
  // i번째 시나리오의 이름 = i번째 루트에 매겨진 이름. 하나라도 밀리면 여기서 깨진다.
  assertEquals(scen.map((x) => x.name), roots.map((id) => scenarioNames[id]))
  assertEquals(scen.map((x) => x.name), ['하하하', '가나다', '바바바'])
})

Deno.test('boilerplateRootIds: greeting·fallback만', () => {
  assertEquals(boilerplateRootIds(flow), ['w', 'ae'])
  assertEquals(boilerplateRootIds({ dialogs: [] }), [])
})

Deno.test('walk: then과 body를 모두 따라간다', () => {
  const byId = new Map([
    ['r', { id: 'r', then: ['loop'] }],
    ['loop', { id: 'loop', type: 'subflow', then: ['after'], body: ['inner'] }],
    ['inner', { id: 'inner', then: [] }],
    ['after', { id: 'after', then: [] }],
  ])
  assertEquals(walk('r', byId).sort(), ['after', 'inner', 'loop', 'r'])
})

Deno.test('walk: stopAt에 걸린 id에서 멈춘다(그 자식도 안 간다)', () => {
  const byId = new Map([
    ['r', { id: 'r', then: ['x'] }],
    ['x', { id: 'x', then: ['deep'] }],
    ['deep', { id: 'deep', then: [] }],
  ])
  assertEquals(walk('r', byId, new Set(['x'])), ['r'])
})

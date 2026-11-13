import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { extractScenarioMiniBot } from './scenarioMiniBot.js'

const flow = {
  id: 'bot', name: '원본봇',
  dialogs: [
    { id: 'predialog', then: ['p1'], nodes: [{ id: 'p1', type: 'set', then: [] }] },
    { id: 'main', then: ['w', 'r1', 'r2', 'ae'], nodes: [
      { id: 'w', type: 'greeting', then: ['wOut'] },
      { id: 'wOut', type: 'output', then: [], config: { items: [] } },
      { id: 'ae', type: 'fallback', then: [] },
      { id: 'r1', type: 'node', condition: 'intent("예약")', then: ['r1a', 'r1loop'] },
      { id: 'r1a', type: 'output', then: [], config: { items: [] } },
      // 경계-교차 간선(scenarioAssets.test.js의 픽스처와 같은 형태 — 실무 폴백/핸드오프를 흉내):
      // r1loop→ae(살아남는 보일러플레이트로의 간선), r1inner→r2(옆 시나리오로의 죽는 간선).
      { id: 'r1loop', type: 'subflow', then: ['ae'], body: ['r1inner'] },
      { id: 'r1inner', type: 'set', then: ['r2'], config: { items: [] } },
      { id: 'r2', type: 'node', condition: 'intent("주문")', then: ['r2a'] },
      { id: 'r2a', type: 'output', then: [], config: { items: [] } },
    ] },
  ],
}

Deno.test('고른 시나리오와 보일러플레이트만 남는다', () => {
  const bot = extractScenarioMiniBot(flow, 0)
  const main = bot.dialogs.find((d) => d.id === 'main')
  assertEquals(main.then, ['w', 'r1', 'ae'])
  assertEquals(main.nodes.map((n) => n.id).sort(), ['ae', 'r1', 'r1a', 'r1inner', 'r1loop', 'w', 'wOut'])
})

Deno.test('루프 body 자식이 포함된다(scenarioPortion의 결함을 되풀이하지 않는다)', () => {
  const ids = extractScenarioMiniBot(flow, 0).dialogs.find((d) => d.id === 'main').nodes.map((n) => n.id)
  assert(ids.includes('r1inner'), 'body 자식 r1inner가 빠졌다')
})

Deno.test('두 번째 시나리오를 고르면 첫 번째가 빠진다', () => {
  const main = extractScenarioMiniBot(flow, 1).dialogs.find((d) => d.id === 'main')
  assertEquals(main.then, ['w', 'r2', 'ae'])
  assertEquals(main.nodes.some((n) => n.id === 'r1'), false)
})

Deno.test('경계를 넘는 간선이 있어도 옆 시나리오를 끌어오지 않는다', () => {
  // 픽스처가 실제로 경계를 넘는 간선을 갖고 있어야 이 테스트가 의미 있다
  const src = flow.dialogs.find((d) => d.id === 'main').nodes.find((n) => n.id === 'r1inner')
  assertEquals(src.then.includes('r2'), true)

  const main = extractScenarioMiniBot(flow, 0).dialogs.find((d) => d.id === 'main')
  const ids = main.nodes.map((n) => n.id)
  assertEquals(ids.includes('r2'), false)
  assertEquals(ids.includes('r2a'), false)
  // 죽은 참조가 남지 않는다
  assertEquals(main.nodes.find((n) => n.id === 'r1inner').then.includes('r2'), false)
  // 보존되는 보일러플레이트로 가는 간선은 살아남는다
  assertEquals(main.nodes.find((n) => n.id === 'r1loop').then.includes('ae'), true)
})

Deno.test('main 밖 다이얼로그는 그대로 남는다', () => {
  const bot = extractScenarioMiniBot(flow, 0)
  assertEquals(bot.dialogs.find((d) => d.id === 'predialog').nodes.length, 1)
})

Deno.test('원본을 변형하지 않는다', () => {
  extractScenarioMiniBot(flow, 0)
  assertEquals(flow.dialogs.find((d) => d.id === 'main').nodes.length, 9)
})

Deno.test('범위 밖 인덱스·main 없음은 null', () => {
  assertEquals(extractScenarioMiniBot(flow, 9), null)
  assertEquals(extractScenarioMiniBot({ dialogs: [] }, 0), null)
  assertEquals(extractScenarioMiniBot(null, 0), null)
})


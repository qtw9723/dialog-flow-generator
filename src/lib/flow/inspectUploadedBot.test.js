import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { inspectUploadedBot } from './inspectUploadedBot.js'

const FIXTURES = ['node-sample', 'llm-sample']
const load = async (n) => JSON.parse(await Deno.readTextFile(`docs/superpowers/fixtures/bots/${n}.json`))

const ok = (nodes, then = ['a']) => ({
  id: 'b', name: '봇', dialogs: [{ id: 'main', then, nodes }],
})

// ── 차단 ────────────────────────────────────────────────────────────────

Deno.test('차단: dialogs가 없다', () => {
  const r = inspectUploadedBot({ id: 'x', name: 'y' })
  assertEquals(r.ok, false)
  assertEquals(r.blocking[0].includes('dialogs'), true)
})

Deno.test('차단: main 다이얼로그가 없다', () => {
  const r = inspectUploadedBot({ dialogs: [{ id: 'sub', then: [], nodes: [{ id: 'a', type: 'output' }] }] })
  assertEquals(r.ok, false)
  assertEquals(r.blocking.some((b) => b.includes('main')), true)
})

Deno.test('차단: 끊긴 연결', () => {
  const r = inspectUploadedBot(ok([{ id: 'a', type: 'output', then: ['없는노드'] }]))
  assertEquals(r.ok, false)
  assertEquals(r.blocking.some((b) => b.includes('끊긴 연결')), true)
})

Deno.test('차단: 순환', () => {
  const r = inspectUploadedBot(ok([
    { id: 'a', type: 'output', then: ['b'] },
    { id: 'b', type: 'output', then: ['a'] },
  ]))
  assertEquals(r.ok, false)
  assertEquals(r.blocking.some((b) => b.includes('순환')), true)
})

Deno.test('차단: 노드 id 중복', () => {
  const r = inspectUploadedBot(ok([
    { id: 'a', type: 'output', then: [] },
    { id: 'a', type: 'set', then: [] },
  ]))
  assertEquals(r.ok, false)
  assertEquals(r.blocking.some((b) => b.includes('중복')), true)
})

Deno.test('차단: 노드 0개', () => {
  const r = inspectUploadedBot({ dialogs: [{ id: 'main', then: [], nodes: [] }] })
  assertEquals(r.ok, false)
})

Deno.test('잘못된 입력도 throw하지 않는다', () => {
  for (const bad of [null, undefined, [], 'x', 42]) {
    const r = inspectUploadedBot(bad)
    assertEquals(r.ok, false)
    assertEquals(Array.isArray(r.blocking), true)
  }
})

// ── 미지 타입은 차단하지 않는다 ─────────────────────────────────────────

Deno.test('미지 타입은 통과시킨다(차단 아님)', () => {
  const r = inspectUploadedBot(ok([{ id: 'a', type: 'zzz_모르는타입', then: [] }]))
  assertEquals(r.ok, true)
  assertEquals(r.info.unknownTypes, ['zzz_모르는타입'])
  assertEquals(r.info.lockedCount, 1)
})

Deno.test('표현식 type도 차단하지 않고 미지로 집계된다', () => {
  const expr = 'context.type ? context.type : "b" '
  const r = inspectUploadedBot(ok([{ id: 'a', type: expr, then: [] }]))
  assertEquals(r.ok, true)
  assertEquals(r.info.unknownTypes.includes(expr), true)
})

Deno.test('레지스트리에 라벨이 있는 타입은 unknownTypes에 넣지 않는다', () => {
  // postback은 편집은 못 하지만 우리가 이름을 아는 타입 — "모르는 타입" 경고 대상이 아니다.
  const r = inspectUploadedBot(ok([{ id: 'a', type: 'postback', then: [] }]))
  assertEquals(r.ok, true)
  assertEquals(r.info.unknownTypes, [])
  assertEquals(r.info.lockedCount, 1)
})

// ── 실제 봇 fixture ─────────────────────────────────────────────────────

for (const name of FIXTURES) {
  Deno.test(`fixture ${name}: 통과한다`, async () => {
    const r = inspectUploadedBot(await load(name))
    assertEquals(r.ok, true, `차단됨: ${r.blocking.join(' / ')}`)
    assertEquals(r.info.nodeCount > 0, true)
  })
}

Deno.test('node.body가 id 문자열 배열이어도 노드로 세지 않는다 (실제 솔루션 봇 형태)', () => {
  const r = inspectUploadedBot({
    dialogs: [{ id: 'main', then: ['a'], nodes: [
      { id: 'a', type: 'subflow', then: [], body: ['b'] },
      { id: 'b', type: 'output', then: [] },
    ] }],
  })
  assertEquals(r.ok, true, r.blocking.join(' / '))
  assertEquals(r.info.nodeCount, 2)
  assertEquals(r.info.typelessCount, 0)
})

Deno.test('차단: body가 없는 노드를 가리킨다', () => {
  const r = inspectUploadedBot({
    dialogs: [{ id: 'main', then: ['a'], nodes: [{ id: 'a', type: 'subflow', then: [], body: ['없음'] }] }],
  })
  assertEquals(r.ok, false)
  assertEquals(r.blocking.some((b) => b.includes('끊긴 연결')), true)
})

Deno.test('body가 노드 객체 배열이면 노드로 센다 (생성기 생성 봇 형태)', () => {
  const r = inspectUploadedBot({
    dialogs: [{ id: 'main', then: ['a'], nodes: [
      { id: 'a', type: 'subflow', then: [], body: [{ id: 'a__b1', type: 'output', then: [] }] },
    ] }],
  })
  assertEquals(r.ok, true, r.blocking.join(' / '))
  assertEquals(r.info.nodeCount, 2)
})

Deno.test('fixture 4종 모두 type 없는 노드가 0건이다', async () => {
  for (const f of FIXTURES) {
    const r = inspectUploadedBot(await load(f))
    assertEquals(r.info.typelessCount, 0, `${f}에 type 없는 노드가 있다`)
  }
})


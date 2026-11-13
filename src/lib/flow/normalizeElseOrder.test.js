import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { normalizeElseOrder } from "./normalizeElseOrder.js"

// 조건 없는 갈래(else)는 형제 조건 갈래보다 뒤에 와야 한다. 앞에 있으면 순서대로 평가하는
// 런타임에서 else가 항상 먼저 잡혀 조건 갈래가 죽는다. 다이어그램엔 then 순서를 바꿀 UI가
// 없으므로(차단만 하면 고칠 방법이 없다) 자동 정렬하고 무엇을 옮겼는지 알린다.

const flow = (nodes, then = ['br']) => ({ dialogs: [{ id: 'main', nodes, then }] })
const node = (id, extra = {}) => ({ id, type: 'output', label: id, then: [], ...extra })

Deno.test("else가 조건 갈래보다 앞이면 뒤로 옮긴다", () => {
  const f = flow([
    node('br', { type: 'node', label: '분기', then: ['fallback', 'ok'] }),
    node('fallback'),
    node('ok', { condition: 'local.x != null' }),
  ])
  const { flow: out, moved } = normalizeElseOrder(f)
  assertEquals(out.dialogs[0].nodes[0].then, ['ok', 'fallback'])
  assertEquals(moved.length, 1)
  assertEquals(moved[0].nodeId, 'br')
  assertEquals(moved[0].label, '분기')
})

Deno.test("이미 else가 마지막이면 그대로 두고 보고도 없다", () => {
  const f = flow([
    node('br', { type: 'node', then: ['ok', 'fallback'] }),
    node('ok', { condition: 'local.x != null' }),
    node('fallback'),
  ])
  const { flow: out, moved } = normalizeElseOrder(f)
  assertEquals(out.dialogs[0].nodes[0].then, ['ok', 'fallback'])
  assertEquals(moved, [])
})

Deno.test("3갈래에서 가운데 else도 맨 뒤로 — 조건 갈래끼리의 순서는 보존", () => {
  const f = flow([
    node('br', { type: 'node', then: ['a', 'fallback', 'b'] }),
    node('a', { condition: "input.text.includes('가')" }),
    node('fallback'),
    node('b', { condition: "input.text.includes('나')" }),
  ])
  const { flow: out } = normalizeElseOrder(f)
  assertEquals(out.dialogs[0].nodes[0].then, ['a', 'b', 'fallback'])
})

Deno.test("조건 갈래가 하나도 없으면 건드리지 않는다 — 모호 분기는 별도 검증 소관", () => {
  const f = flow([
    node('br', { type: 'node', then: ['x', 'y'] }),
    node('x'),
    node('y'),
  ])
  const { flow: out, moved } = normalizeElseOrder(f)
  assertEquals(out.dialogs[0].nodes[0].then, ['x', 'y'])
  assertEquals(moved, [])
})

Deno.test("갈래가 하나면 분기가 아니라 무영향", () => {
  const f = flow([node('br', { then: ['only'] }), node('only')])
  const { flow: out, moved } = normalizeElseOrder(f)
  assertEquals(out.dialogs[0].nodes[0].then, ['only'])
  assertEquals(moved, [])
})

Deno.test("반복 본문 안의 분기도 같은 규칙으로 정렬된다", () => {
  const f = flow([
    node('loop', { type: 'subflow', body: ['b1'], then: [] }),
    node('b1', { type: 'node', label: '본문 분기', then: ['b_else', 'b_ok'] }),
    node('b_else'),
    node('b_ok', { condition: 'context.done == true' }),
  ], ['loop'])
  const { flow: out, moved } = normalizeElseOrder(f)
  const b1 = out.dialogs[0].nodes.find((n) => n.id === 'b1')
  assertEquals(b1.then, ['b_ok', 'b_else'])
  assertEquals(moved.length, 1)
})

Deno.test("입력을 변형하지 않는다(원본 불변)", () => {
  const f = flow([
    node('br', { type: 'node', then: ['fallback', 'ok'] }),
    node('fallback'),
    node('ok', { condition: 'local.x != null' }),
  ])
  normalizeElseOrder(f)
  assertEquals(f.dialogs[0].nodes[0].then, ['fallback', 'ok'])
})

Deno.test("빈/이상 입력에도 안전", () => {
  assertEquals(normalizeElseOrder({}).moved, [])
  assertEquals(normalizeElseOrder(null).moved, [])
  assertEquals(normalizeElseOrder({ dialogs: [] }).moved, [])
})

// findConditionlessRoots·refDiagram의 entryConditionOf와 기준을 맞춘다 — 둘 다
// condition ?? config.condition을 본다. config.condition만 있는 노드도 조건 갈래로 취급해야
// (top-level condition만 보면) else와 뒤섞여 잘못 정렬될 수 있다.
Deno.test("config.condition만 있어도 조건 갈래로 인정한다(형제 검출기와 기준 통일)", () => {
  const f = flow([
    node('br', { type: 'node', then: ['fallback', 'ok'] }),
    node('fallback'),
    node('ok', { config: { condition: 'local.x != null' } }),
  ])
  const { flow: out, moved } = normalizeElseOrder(f)
  assertEquals(out.dialogs[0].nodes[0].then, ['ok', 'fallback'])
  assertEquals(moved.length, 1)
})

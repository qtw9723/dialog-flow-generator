import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { findConditionlessRoots } from "./findConditionlessRoots.js"

// greeting(_greeting)·fallback(catch-all)는 보일러라 제외한다.
const flow = (nodes, then) => ({ dialogs: [{ id: 'main', then, nodes }] })

Deno.test("조건 없는 시나리오 루트를 찾는다", () => {
  const f = flow([
    { id: 'w', type: 'greeting', label: '환영', condition: '_greeting', then: [] },
    { id: 's1', type: 'node', label: '배송 조회 진입', condition: 'input.text.includes("배송")', then: [] },
    { id: 's2', type: 'node', label: '주문 취소 진입', then: [] },
    { id: 'ae', type: 'fallback', label: '기타', then: [] },
  ], ['w', 's1', 's2', 'ae'])
  const out = findConditionlessRoots(f)
  assertEquals(out.length, 1)
  assertEquals(out[0].nodeId, 's2')
  assertEquals(out[0].label, '주문 취소 진입')
})

Deno.test("greeting·fallback는 조건이 없어도 보고하지 않는다", () => {
  const f = flow([
    { id: 'w', type: 'greeting', label: '환영', then: [] },
    { id: 'ae', type: 'fallback', label: '기타', then: [] },
  ], ['w', 'ae'])
  assertEquals(findConditionlessRoots(f), [])
})

Deno.test("모든 루트에 조건이 있으면 빈 배열", () => {
  const f = flow([
    { id: 's1', type: 'node', label: 'A', condition: 'input.text.includes("a")', then: [] },
    { id: 's2', type: 'node', label: 'B', condition: 'input.text.includes("b")', then: [] },
  ], ['s1', 's2'])
  assertEquals(findConditionlessRoots(f), [])
})

Deno.test("config.condition에 있어도 조건 있음으로 본다", () => {
  const f = flow([
    { id: 's1', type: 'node', label: 'A', config: { condition: 'input.text.includes("a")' }, then: [] },
  ], ['s1'])
  assertEquals(findConditionlessRoots(f), [])
})

Deno.test("빈/이상 입력에도 안전", () => {
  assertEquals(findConditionlessRoots(null), [])
  assertEquals(findConditionlessRoots({}), [])
  assertEquals(findConditionlessRoots({ dialogs: [] }), [])
})

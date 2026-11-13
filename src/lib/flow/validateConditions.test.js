import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { validateConditions } from "./validateConditions.js"

function flowWith(nodes) {
  return { dialogs: [{ id: 'main', nodes }] }
}

Deno.test("조건 없음 → 이슈 없음", () => {
  assertEquals(validateConditions(flowWith([{ id: 'a', type: 'output' }])), [])
})

Deno.test("정상 조건(정의된 변수·특수변수) → 이슈 없음", () => {
  const flow = flowWith([
    { id: 'set1', type: 'set', config: { items: [{ key: 'local.status' }] } },
    { id: 'b', type: 'output', condition: "local.status == 'paid'" },
    { id: 'c', type: 'output', condition: "input.text.includes('취소')" },
    { id: 'e', type: 'output', condition: "_result != null" },
  ])
  assertEquals(validateConditions(flow), [])
})

Deno.test("괄호 불균형 → error", () => {
  const flow = flowWith([{ id: 'b', type: 'output', condition: "input.text.includes('취소'" }])
  const issues = validateConditions(flow)
  assertEquals(issues.length, 1)
  assertEquals(issues[0].severity, 'error')
  assertEquals(issues[0].nodeId, 'b')
})

Deno.test("따옴표 불균형 → error", () => {
  const flow = flowWith([{ id: 'b', type: 'output', condition: "local.x == 'paid" }])
  assertEquals(validateConditions(flow)[0].severity, 'error')
})

Deno.test("정의되지 않은 local 변수 참조 → warning", () => {
  const flow = flowWith([{ id: 'b', type: 'output', condition: "local.notDefined == true" }])
  const issues = validateConditions(flow)
  assertEquals(issues.length, 1)
  assertEquals(issues[0].severity, 'warning')
  assertEquals(issues[0].message.includes('local.notDefined'), true)
})

Deno.test("미추적 스코프(slot.)·특수변수는 오탐하지 않음", () => {
  const flow = flowWith([
    { id: 'b', type: 'output', condition: "slot.foo == true" },
    { id: 'c', type: 'output', condition: "_error" },
  ])
  assertEquals(validateConditions(flow), [])
})

Deno.test("문법 오류면 변수 점검은 건너뜀(중복 이슈 방지)", () => {
  const flow = flowWith([{ id: 'b', type: 'output', condition: "local.undef.includes('x'" }])
  const issues = validateConditions(flow)
  assertEquals(issues.length, 1)
  assertEquals(issues[0].severity, 'error')
})

Deno.test("정의된 context 변수(set 키)는 통과", () => {
  const flow = flowWith([
    { id: 's', type: 'set', config: { items: [{ key: 'context.done' }] } },
    { id: 'b', type: 'output', condition: "context.done == true" },
  ])
  assertEquals(validateConditions(flow), [])
})

Deno.test("여러 노드·여러 이슈 수집", () => {
  const flow = flowWith([
    { id: 'a', type: 'output', condition: "local.x == 'y'" },       // x 미정의 → warning
    { id: 'b', type: 'output', condition: "includes('z'" },          // 괄호 불균형 → error
  ])
  const issues = validateConditions(flow)
  assertEquals(issues.length, 2)
  assertEquals(issues.filter(i => i.severity === 'error').length, 1)
  assertEquals(issues.filter(i => i.severity === 'warning').length, 1)
})

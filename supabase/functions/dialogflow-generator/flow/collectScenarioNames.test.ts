import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { collectScenarioNames } from "./collectScenarioNames.ts"

const spec: any = { version: "1", entry: "s1", nodes: [
  { id: "s1", type: "node", intent: "배송 조회 진입", next: ["s1_out"], scenarioName: "배송 조회" },
  { id: "s1_out", type: "output", intent: "송장 요청", next: [] },
  { id: "s2", type: "node", intent: "주문 취소 진입", next: [], scenarioName: "주문 취소" },
] }
const machine: any = { dialogs: [{ id: "main", then: ["greeting1", "s1", "s2", "fallback"], nodes: [
  { id: "greeting1", type: "greeting" }, { id: "s1", type: "node" }, { id: "s1_out", type: "output" },
  { id: "s2", type: "node" }, { id: "fallback", type: "fallback" },
] }] }

Deno.test("main.then 루트인 노드의 scenarioName만 모은다", () => {
  const { scenarios } = collectScenarioNames(spec, machine, [])
  assertEquals(scenarios, { s1: "배송 조회", s2: "주문 취소" })
})

Deno.test("루트가 아닌 노드에 붙은 이름은 무시한다", () => {
  const s: any = { ...spec, nodes: [...spec.nodes, { id: "s1_out", type: "output", intent: "x", next: [], scenarioName: "엉뚱" }] }
  const { scenarios } = collectScenarioNames(s, machine, [])
  assertEquals("s1_out" in scenarios, false)
})

Deno.test("입력 이름이 있는데 태깅이 어긋나면 mismatch로 기록한다", () => {
  const { scenarios, mismatch } = collectScenarioNames(spec, machine, ["배송 조회", "환불 문의"])
  assertEquals(scenarios.s2, "주문 취소")       // 기록은 그대로 (생성 무해성)
  assertEquals(mismatch.length, 1)
  assertEquals(mismatch[0].includes("주문 취소"), true)
})

Deno.test("입력 이름이 없으면 mismatch를 보지 않는다", () => {
  assertEquals(collectScenarioNames(spec, machine, []).mismatch, [])
})

// 회귀 고정: index.ts가 mismatch 검사용 입력 이름 집합으로 (레퍼런스 선택 시나리오만 담는)
// seedSelections 대신 설문의 "전체" 시나리오 이름을 넘겨야 한다. 태깅된 이름이 전부 그 집합에
// 있으면 — 부분집합만 전달했을 때 나머지가 오탐되는 일 없이 — mismatch는 조용해야 한다.
Deno.test("입력 이름 집합에 태깅된 이름이 전부 있으면 mismatch가 비어 있다", () => {
  const { mismatch } = collectScenarioNames(spec, machine, ["배송 조회", "주문 취소", "환불 문의"])
  assertEquals(mismatch, [])
})

Deno.test("입력 이름 집합에 없는 이름만 mismatch로 잡힌다(있는 이름은 조용)", () => {
  const { mismatch } = collectScenarioNames(spec, machine, ["배송 조회"])
  assertEquals(mismatch.length, 1)
  assertEquals(mismatch[0].includes("주문 취소"), true)
  assertEquals(mismatch.some((m) => m.includes("배송 조회")), false)
})

Deno.test("scenarioName이 하나도 없으면 빈 객체", () => {
  const s: any = { version: "1", entry: "s1", nodes: [{ id: "s1", type: "node", intent: "x", next: [] }] }
  assertEquals(collectScenarioNames(s, machine, []).scenarios, {})
})

import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { parseFlowSpec } from "./parseFlowSpec.ts"

Deno.test("parseFlowSpec: 코드펜스 감싼 JSON 추출", () => {
  const text = "설명\n```json\n{\"version\":\"1\",\"entry\":\"n1\",\"nodes\":[{\"id\":\"n1\",\"type\":\"Output\",\"intent\":\"인사\",\"next\":[]}]}\n```"
  const flow = parseFlowSpec(text)
  assertEquals(flow.entry, "n1")
  assertEquals(flow.nodes.length, 1)
})

Deno.test("parseFlowSpec: 필수 필드 없으면 throw", () => {
  assertThrows(() => parseFlowSpec("{\"foo\":1}"), Error, "FlowSpec")
})

Deno.test("parseFlowSpec: loop 필드 보존(body/exitVar/max)", () => {
  const json = JSON.stringify({
    entry: "loop1",
    nodes: [
      { id: "loop1", type: "loop", intent: "항목 반복 수집", next: ["done"],
        loop: { body: ["ask"], exitVar: "_user.done", max: 5 } },
      { id: "ask", type: "output", intent: "항목 요청", next: ["setflag"] },
      { id: "setflag", type: "set", intent: "그만이면 done=true", next: [] },
      { id: "done", type: "output", intent: "완료", next: [] },
    ],
  })
  const spec = parseFlowSpec(json)
  const loop = spec.nodes.find((n) => n.id === "loop1")!
  assertEquals(loop.loop, { body: ["ask"], exitVar: "_user.done", max: 5 })
})

Deno.test("parseFlowSpec: loop 없는 노드는 loop 미정의", () => {
  const spec = parseFlowSpec(JSON.stringify({ entry: "a", nodes: [{ id: "a", type: "output", next: [] }] }))
  assertEquals(spec.nodes[0].loop, undefined)
})

Deno.test("parseFlowSpec: loop.body 비배열/exitVar 누락 방어", () => {
  const spec = parseFlowSpec(JSON.stringify({
    entry: "l", nodes: [{ id: "l", type: "loop", next: [], loop: { body: "x" } }],
  }))
  assertEquals(spec.nodes[0].loop, { body: [], exitVar: "", max: undefined })
})

Deno.test("parseFlowSpec: scenarioName을 보존한다", () => {
  const spec = parseFlowSpec(JSON.stringify({
    entry: "s1", nodes: [{ id: "s1", type: "node", intent: "배송 조회 진입", next: [], scenarioName: "배송 조회" }],
  }))
  assertEquals((spec.nodes[0] as any).scenarioName, "배송 조회")
})

Deno.test("parseFlowSpec: scenarioName이 없으면 키 자체를 만들지 않는다", () => {
  const spec = parseFlowSpec(JSON.stringify({
    entry: "s1", nodes: [{ id: "s1", type: "node", intent: "x", next: [] }],
  }))
  assertEquals("scenarioName" in (spec.nodes[0] as any), false)
})

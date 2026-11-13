import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { extractCategory, selectExamples, scenarioPortion, renderExamples } from "./scenarioExamples.ts"

Deno.test("extractCategory: 응답에서 산업군 값 추출", () => {
  const r = { intent: { q1: "예약봇" }, required_context: { q2: "의료", q3: "샘플봇" } }
  assertEquals(extractCategory(r), "의료")
  assertEquals(extractCategory({ intent: { q: "그냥텍스트" } }), "")
})

Deno.test("selectExamples: 이름 매칭 우선 + k 캡", () => {
  const refs = [{ name: "진료 예약" }, { name: "예약 조회" }, { name: "보험 청구" }]
  const sel = selectExamples(refs, ["예약"], 2)
  assertEquals(sel.length, 2)
  assertEquals(sel[0].name, "진료 예약")
  assertEquals(sel.map((r) => r.name).includes("보험 청구"), false)
})

Deno.test("selectExamples: 매칭 없으면 앞에서 k개", () => {
  const refs = [{ name: "A" }, { name: "B" }, { name: "C" }]
  assertEquals(selectExamples(refs, ["없음"], 2).map((r) => r.name), ["A", "B"])
})

const miniBot = {
  dialogs: [
    { id: "main", then: ["w", "n1", "fallback"], nodes: [
      { id: "w", type: "greeting", then: ["greet"] },
      { id: "greet", type: "output", then: [] },
      { id: "n1", type: "output", then: ["n1_set"], condition: "input.text.includes('예약')", config: { items: [{ type: "text", text: [{ texts: ["성함을 알려주세요"] }] }] } },
      { id: "n1_set", type: "set", then: [], config: { items: [{ key: "local.name", value: "input.text" }] } },
      { id: "fallback", type: "fallback", then: ["fallback_out"] },
      { id: "fallback_out", type: "output", then: [] },
    ]},
  ],
}

Deno.test("scenarioPortion: 보일러플레이트 제외, 시나리오 노드만", () => {
  const nodes = scenarioPortion(miniBot)
  const ids = nodes.map((n) => n.id).sort()
  assertEquals(ids, ["n1", "n1_set"])  // w/greet/fallback 제외
})

Deno.test("renderExamples: 빈 배열→'', 있으면 예시 텍스트", () => {
  assertEquals(renderExamples([]), "")
  const out = renderExamples([{ name: "예약", category: "의료", flow_json: miniBot }])
  assertStringIncludes(out, '예시 "예약" (의료)')
  assertStringIncludes(out, "local.name=input.text")
  assertStringIncludes(out, "input.text.includes('예약')")
})

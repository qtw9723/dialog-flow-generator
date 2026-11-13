import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { deriveStructure, deriveUserFlow } from "./refDiagram.js"

// 시나리오명 3단 폴백: ① 번들(generation_tiers.scenarios) ② 조건 파생 ③ 루트 라벨
const flow = {
  dialogs: [{
    id: 'main',
    then: ['w', 's1_entry', 'ae'],
    nodes: [
      { id: 'w', type: 'greeting', label: '환영', condition: '_greeting', then: [] },
      { id: 's1_entry', type: 'node', label: "사용자가 '배송 조회'로 진입했는지 판별한다",
        condition: 'input.text.includes("배송 조회")', then: ['s1_out'] },
      { id: 's1_out', type: 'output', label: '송장번호를 요청한다', then: [] },
      { id: 'ae', type: 'fallback', label: '기타', then: [] },
    ],
  }],
}

Deno.test("① 번들에 이름이 있으면 그것을 쓴다", () => {
  const { scenarios } = deriveStructure(flow, { scenarioNames: { s1_entry: '배송 조회' } })
  assertEquals(scenarios.length, 1)
  assertEquals(scenarios[0].name, '배송 조회')
})

Deno.test("② 번들이 없으면 진입 조건에서 파생한다", () => {
  const { scenarios } = deriveStructure(flow)
  assertEquals(scenarios[0].name, '배송 조회')
})

Deno.test("③ 조건에서도 못 뽑으면 루트 라벨로 폴백한다", () => {
  const f = JSON.parse(JSON.stringify(flow))
  f.dialogs[0].nodes[1].condition = 'local.step == 3'
  const { scenarios } = deriveStructure(f)
  assertEquals(scenarios[0].name, 'local.step == 3')
})

Deno.test("번들에 해당 루트 키가 없으면 파생으로 내려간다", () => {
  const { scenarios } = deriveStructure(flow, { scenarioNames: { other_root: '무관' } })
  assertEquals(scenarios[0].name, '배송 조회')
})

Deno.test("번들 값이 빈 문자열이면 무시하고 파생한다", () => {
  const { scenarios } = deriveStructure(flow, { scenarioNames: { s1_entry: '   ' } })
  assertEquals(scenarios[0].name, '배송 조회')
})

Deno.test("title은 하위호환으로 루트 라벨 그대로 유지된다", () => {
  const { scenarios } = deriveStructure(flow, { scenarioNames: { s1_entry: '배송 조회' } })
  assertEquals(scenarios[0].title, "사용자가 '배송 조회'로 진입했는지 판별한다")
})

Deno.test("시나리오 루트 노드에만 entryCondition이 실린다", () => {
  const { nodes } = deriveStructure(flow)
  assertEquals(nodes.find(n => n.id === 's1_entry').entryCondition, 'input.text.includes("배송 조회")')
  assertEquals(nodes.find(n => n.id === 's1_out').entryCondition, '')
})

Deno.test("조건이 config.condition에 있어도 읽는다", () => {
  const f = JSON.parse(JSON.stringify(flow))
  delete f.dialogs[0].nodes[1].condition
  f.dialogs[0].nodes[1].config = { condition: 'input.text.includes("배송 조회")' }
  const { nodes } = deriveStructure(f)
  assertEquals(nodes.find(n => n.id === 's1_entry').entryCondition, 'input.text.includes("배송 조회")')
})

// ─── 사용자 흐름도도 같은 이름을 쓴다 ───
// 구조 다이어그램과 흐름도가 같은 시나리오를 다르게 부르면 안 된다(같은 결과의 두 뷰).

Deno.test("흐름도: 번들에 이름이 있으면 그것을 쓴다", () => {
  const { scenarios } = deriveUserFlow(flow, { scenarioNames: { s1_entry: '배송 조회' } })
  assertEquals(scenarios.length, 1)
  assertEquals(scenarios[0].name, '배송 조회')
})

Deno.test("흐름도: 번들이 없으면 진입 조건에서 파생한다", () => {
  const { scenarios } = deriveUserFlow(flow)
  assertEquals(scenarios[0].name, '배송 조회')
})

Deno.test("흐름도: 조건에서도 못 뽑으면 루트 라벨로 폴백한다", () => {
  const f = JSON.parse(JSON.stringify(flow))
  f.dialogs[0].nodes[1].condition = 'local.step == 3'
  const { scenarios } = deriveUserFlow(f)
  assertEquals(scenarios[0].name, 'local.step == 3')
})

Deno.test("흐름도: title은 하위호환으로 루트 라벨 그대로 유지된다", () => {
  const { scenarios } = deriveUserFlow(flow, { scenarioNames: { s1_entry: '배송 조회' } })
  assertEquals(scenarios[0].title, "사용자가 '배송 조회'로 진입했는지 판별한다")
})

Deno.test("구조 다이어그램과 흐름도가 같은 이름을 쓴다", () => {
  const opts = { scenarioNames: { s1_entry: '배송 조회' } }
  assertEquals(deriveStructure(flow, opts).scenarios[0].name, deriveUserFlow(flow, opts).scenarios[0].name)
})

Deno.test("흐름도: 인자 없이 호출해도 안전(기존 호출부 무변경)", () => {
  const { scenarios } = deriveUserFlow(flow)
  assertEquals(typeof scenarios[0].name, 'string')
  assertEquals(Array.isArray(scenarios[0].steps), true)
})

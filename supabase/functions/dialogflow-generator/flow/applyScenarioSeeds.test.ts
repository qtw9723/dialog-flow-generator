import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { collectSeedSelections, applyScenarioSeeds } from "./applyScenarioSeeds.ts"

const REF = {
  id: "ref-uuid-1", name: "배송 조회봇",
  flow_json: { dialogs: [{ id: "main", then: ["w", "s1", "ae"], nodes: [
    { id: "w", type: "greeting", then: [], config: {} },
    { id: "s1", type: "output", label: "안내", condition: "", then: ["s2"], config: { items: [{ type: "text", text: [{ texts: ["운송장번호를 알려주세요"] }] }] } },
    { id: "s2", type: "input", label: "운송장", then: [], config: {} },
    { id: "ae", type: "fallback", then: [], config: {} },
  ] }] },
}
const RESPONSES = { q1: [{ "시나리오 이름": "배송 조회", "진입 발화": "배송 어디쯤이야", "레퍼런스 선택": "ref-uuid-1" }] }
const BOT = () => ({ dialogs: [{ id: "main", then: ["w1", "n2", "a1"], nodes: [
  { id: "w1", type: "greeting", then: [], config: {} },
  { id: "n2", type: "node", label: "배송 조회 시나리오 시작", condition: "input.text.includes('배송 어디쯤이야')", then: ["n3"], config: {} },
  { id: "n3", type: "output", label: "옛 안내", condition: "", then: [], config: { items: [] } },
  { id: "a1", type: "fallback", then: [], config: {} },
] }] })

Deno.test("collectSeedSelections: 레퍼런스 선택된 시나리오만 수집", () => {
  const s = collectSeedSelections(RESPONSES)
  assertEquals(s, [{ scenarioName: "배송 조회", refKey: "ref-uuid-1", trigger: "배송 어디쯤이야", collectCount: 0 }])
  assertEquals(collectSeedSelections({ q1: [{ "시나리오 이름": "일반", "진입 발화": "x" }] }), [])
})

Deno.test("applyScenarioSeeds: 서브트리 교체 + id 접두사 + 진입 연결 + 타입 시퀀스", () => {
  const bot = BOT()
  const r = applyScenarioSeeds(bot, collectSeedSelections(RESPONSES), [REF])
  assertEquals(r.seeded.length, 1)
  assertEquals(r.seeded[0].ref, "배송 조회봇")
  assertEquals(r.seeded[0].skipped, "")
  assertEquals(r.seeded[0].node_type_sequence, ["output", "input"])
  const main: any = bot.dialogs[0]
  const ids = main.nodes.map((n: any) => n.id)
  assertEquals(ids.includes("n3"), false)                     // 옛 서브트리 제거
  assertEquals(ids.includes("seed0_s1"), true)                // 복제 노드(접두사)
  const entry = main.nodes.find((n: any) => n.id === "n2")
  assertEquals(entry.then, ["seed0_s1"])                       // 진입 → 복제 루트
  const seeded = main.nodes.find((n: any) => n.id === "seed0_s1")
  assertEquals(seeded.then, ["seed0_s2"])                      // 내부 참조 재작성
})

Deno.test("applyScenarioSeeds: 시나리오 루트 부재 시 진입 노드 결정론 생성", () => {
  const bot = BOT()
  bot.dialogs[0].then = ["w1", "a1"]
  bot.dialogs[0].nodes = bot.dialogs[0].nodes.filter((n: any) => ["w1", "a1"].includes(n.id))
  const r = applyScenarioSeeds(bot, collectSeedSelections(RESPONSES), [REF])
  assertEquals(r.seeded[0].skipped, "")
  const main: any = bot.dialogs[0]
  const entry = main.nodes.find((n: any) => n.id === "seed0_entry")
  assertEquals(Boolean(entry), true)
  assertEquals(entry.condition.includes("배송 어디쯤이야"), true)
  assertEquals(main.then.includes("seed0_entry"), true)
})

Deno.test("applyScenarioSeeds: refKey를 name으로도 매칭", () => {
  const bot = BOT()
  const seeds = [{ scenarioName: "배송 조회", refKey: "배송 조회봇", trigger: "배송 어디쯤이야", collectCount: 0 }]
  const r = applyScenarioSeeds(bot, seeds, [REF])
  assertEquals(r.seeded[0].ref_id, "ref-uuid-1")
})

Deno.test("applyScenarioSeeds: 레퍼런스 미존재 → skipped 기록, 봇 무변경", () => {
  const bot = BOT()
  const before = JSON.stringify(bot)
  const seeds = [{ scenarioName: "배송 조회", refKey: "no-such", trigger: "배송 어디쯤이야", collectCount: 0 }]
  const r = applyScenarioSeeds(bot, seeds, [REF])
  assertNotEquals(r.seeded[0].skipped, "")
  assertEquals(JSON.stringify(bot), before)
})

// Fix C1: 레퍼런스 시나리오 루트 자체가 트리거 condition을 가진 "node" 타입인 경우(실제 dev
// 레퍼런스 패턴 — ref-물류.json n2 등). 설문 진입 발화가 레퍼런스 트리거와 다르면 이중 게이트가 되어
// (바깥 entry 조건 통과 후 복제 루트 조건도 통과해야 함) 도달 불가 — 복제 루트 condition은 제거돼야 한다.
const REF_TRIGGER_ROOT = {
  id: "ref-uuid-2", name: "배송 조회봇2",
  flow_json: { dialogs: [{ id: "main", then: ["w", "n2", "ae"], nodes: [
    { id: "w", type: "greeting", then: [], config: {} },
    { id: "n2", type: "node", label: "배송 조회 시나리오 시작", condition: "input.text.includes('배송 어디쯤이야')", then: ["s1"], config: { auth: false } },
    { id: "s1", type: "output", label: "안내", then: ["s2"], config: { items: [] } },
    { id: "s2", type: "input", label: "운송장", then: [], config: {} },
    { id: "ae", type: "fallback", then: [], config: {} },
  ] }] },
}
const BOT_DIFFERENT_TRIGGER = () => ({ dialogs: [{ id: "main", then: ["w1", "b2", "a1"], nodes: [
  { id: "w1", type: "greeting", then: [], config: {} },
  { id: "b2", type: "node", label: "배송 조회 시나리오 시작", condition: "input.text.includes('내 택배 어디야')", then: ["b3"], config: {} },
  { id: "b3", type: "output", label: "옛 안내", condition: "", then: [], config: { items: [] } },
  { id: "a1", type: "fallback", then: [], config: {} },
] }] })

Deno.test("applyScenarioSeeds(Fix C1): 레퍼런스 진입 노드가 복제돼도 트리거 condition은 제거(바깥 entry가 이미 게이트)", () => {
  const bot = BOT_DIFFERENT_TRIGGER()
  const seeds = [{ scenarioName: "배송 조회", refKey: "ref-uuid-2", trigger: "내 택배 어디야", collectCount: 0 }]
  const r = applyScenarioSeeds(bot, seeds, [REF_TRIGGER_ROOT])
  assertEquals(r.seeded[0].skipped, "")
  const main: any = bot.dialogs[0]
  const outerEntry = main.nodes.find((n: any) => n.id === "b2")
  assertEquals(outerEntry.condition, "input.text.includes('내 택배 어디야')") // 바깥 entry는 설문 발화로 게이트 유지
  const clonedRoot = main.nodes.find((n: any) => n.id === "seed0_n2")
  assertEquals(Boolean(clonedRoot), true)
  assertEquals(clonedRoot.condition, "") // 이중 게이트 제거 — 복제 루트 condition은 빈 문자열
  assertEquals(outerEntry.then, ["seed0_n2"])
})

// Fix M-b: scenarioPortion(few-shot용)은 then만 순회해 subflow 루프의 body 자식을 놓친다
// (도매·의료 레퍼런스처럼 루프 보유 시 복제가 깨짐). 시드 복제는 body 자식까지 포함해야 한다.
const REF_WITH_LOOP = {
  id: "ref-uuid-3", name: "루프 시나리오봇",
  flow_json: { dialogs: [{ id: "main", then: ["w", "n2", "ae"], nodes: [
    { id: "w", type: "greeting", then: [], config: {} },
    { id: "n2", type: "node", label: "루프 시나리오 시작", condition: "input.text.includes('루프 테스트')", then: ["loop1"], config: {} },
    { id: "loop1", type: "subflow", label: "반복 수집", then: ["done"], body: ["b1"], config: { loop: { count: "3", condition: "local.done == true" } } },
    { id: "b1", type: "output", label: "안내", then: [], config: { items: [] } },
    { id: "done", type: "output", label: "완료", then: [], config: { items: [] } },
    { id: "ae", type: "fallback", then: [], config: {} },
  ] }] },
}

Deno.test("applyScenarioSeeds(Fix M-b): subflow 루프의 body 자식도 시드 복제에 포함 + 참조 재작성", () => {
  const bot = BOT()
  bot.dialogs[0].then = ["w1", "a1"] // 시나리오 루트 없음 → 진입 노드 결정론 생성 경로
  bot.dialogs[0].nodes = bot.dialogs[0].nodes.filter((n: any) => ["w1", "a1"].includes(n.id))
  const seeds = [{ scenarioName: "루프", refKey: "ref-uuid-3", trigger: "루프 테스트", collectCount: 0 }]
  const r = applyScenarioSeeds(bot, seeds, [REF_WITH_LOOP])
  assertEquals(r.seeded[0].skipped, "")
  assertEquals(r.seeded[0].node_type_sequence, ["node", "subflow", "output", "output"])
  const main: any = bot.dialogs[0]
  const loop = main.nodes.find((n: any) => n.id === "seed0_loop1")
  assertEquals(Boolean(loop), true)
  assertEquals(loop.body, ["seed0_b1"])          // body 자식도 접두사 재작성돼 포함
  assertEquals(loop.then, ["seed0_done"])
  const b1 = main.nodes.find((n: any) => n.id === "seed0_b1")
  assertEquals(Boolean(b1), true)                 // body 자식 노드 자체도 복제됨
})

Deno.test("applyScenarioSeeds: 수집항목 불일치 경고(mismatch)", () => {
  const bot = BOT()
  const responses = { q1: [{ "시나리오 이름": "배송 조회", "진입 발화": "배송 어디쯤이야", "레퍼런스 선택": "ref-uuid-1",
    "수집 정보": [{ "항목명": "운송장번호" }, { "항목명": "주문자명" }, { "항목명": "연락처" }] }] }
  const r = applyScenarioSeeds(bot, collectSeedSelections(responses), [REF])
  assertNotEquals(r.seeded[0].mismatch, "")   // 레퍼런스 input 1개 vs 설문 3개
})

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { assembleScenarios, mergeScenarioAssets } from "./assemble.ts"

// 자체-완결 미니봇 1개: greeting+greet / 시나리오 루트 n1→n1_set / fallback
const miniBot = (sname: string, schema: string, varKey: string) => ({
  name: sname,
  dialogs: [
    { id: "predialog", name: "Pre Dialog", nodes: [] },
    {
      id: "main", name: "Main Dialog", then: ["w", "n1", "fallback"], nodes: [
        { id: "w", type: "greeting", then: ["greet"], condition: "_greeting" },
        { id: "greet", type: "output", then: [], condition: "" },
        { id: "n1", type: "output", then: ["n1_set", "n1_esd"], condition: "input.text.includes('x')" },
        { id: "n1_set", type: "set", then: [], config: { items: [{ key: varKey, value: "input.text" }] } },
        { id: "n1_esd", type: "esd", then: [], config: { type: "create", schemaName: schema, query: { where: null, data: { name: "local.name" } } } },
        { id: "fallback", type: "fallback", then: ["fallback_out"] },
        { id: "fallback_out", type: "output", then: [] },
      ],
    },
    { id: "postdialog", name: "Post Dialog", nodes: [] },
  ],
})

Deno.test("assembleScenarios: greeting/fallback는 1개, 시나리오 루트는 prefix되어 공존", () => {
  const r = assembleScenarios([miniBot("예약", "reservation", "local.name"), miniBot("조회", "lookup", "local.phone")])
  const main = r.flow_json.dialogs.find((d: any) => d.id === "main")
  assertEquals(main.nodes.filter((n: any) => n.type === "greeting").length, 1)
  assertEquals(main.nodes.filter((n: any) => n.type === "fallback").length, 1)
  // 시나리오 루트 2개(then에서 greeting·fallback 제외)
  const roots = main.then.filter((id: string) => id !== "w" && id !== "fallback")
  assertEquals(roots.length, 2)
  assertEquals(new Set(roots).size, 2)          // id 충돌 없음
  assertEquals(roots, ["s0_n1", "s1_n1"])
  // 각 시나리오의 자식 노드도 prefix되어 보존
  assertEquals(main.nodes.some((n: any) => n.id === "s0_n1_set"), true)
  assertEquals(main.nodes.some((n: any) => n.id === "s1_n1_esd"), true)
  // then 참조가 prefix로 갱신됨
  const s0 = main.nodes.find((n: any) => n.id === "s0_n1")
  assertEquals(s0.then, ["s0_n1_set", "s0_n1_esd"])
})

Deno.test("assembleScenarios: 같은 변수 키가 여러 시나리오에 → 경고", () => {
  const r = assembleScenarios([miniBot("예약", "reservation", "local.name"), miniBot("조회", "reservation", "local.name")])
  // local.name 중복 변수 경고 + reservation 스키마는 필드 동일이라 스키마 경고는 없음
  assertEquals(r.warnings.some((w: string) => w.includes("변수") && w.includes("local.name")), true)
})

Deno.test("assembleScenarios: 같은 스키마 다른 필드 → 경고", () => {
  const a = miniBot("예약", "reservation", "local.a")
  const b = miniBot("조회", "reservation", "local.b")
  // b의 esd 필드를 다르게
  const bEsd = b.dialogs[1].nodes.find((n: any) => n.id === "n1_esd") as any
  bEsd.config.query.data = { phone: "local.phone", memo: "x" }
  const r = assembleScenarios([a, b])
  assertEquals(r.warnings.some((w: string) => w.includes("스키마") && w.includes("reservation")), true)
})

Deno.test("assembleScenarios: 빈 입력 → null + 경고", () => {
  const r = assembleScenarios([])
  assertEquals(r.flow_json, null)
  assertEquals(r.warnings.length, 1)
})

Deno.test("assembleScenarios: 루프(subflow)의 body 서브트리도 prefix되어 보존·재작성", () => {
  const bot = miniBot("예약", "reservation", "local.name") as any
  const main = bot.dialogs[1]
  // n1 밑에 검증 루프: vloop.body → ask → ask_set(탈출 flag set)
  main.nodes.push(
    { id: "vloop", type: "subflow", body: ["ask"], then: [], config: { loop: { count: "3", condition: "context.ok" } } },
    { id: "ask", type: "output", then: ["ask_set"], config: {} },
    { id: "ask_set", type: "set", then: [], config: { items: [{ key: "context.ok", value: "true" }] } },
  )
  main.nodes.find((n: any) => n.id === "n1").then.push("vloop")
  const r = assembleScenarios([bot, miniBot("조회", "lookup", "local.phone")])
  const m = r.flow_json.dialogs.find((d: any) => d.id === "main")
  const loop = m.nodes.find((n: any) => n.id === "s0_vloop")
  assertEquals(loop?.body, ["s0_ask"])                                 // body 참조 재작성
  assertEquals(m.nodes.some((n: any) => n.id === "s0_ask"), true)      // body 서브트리 보존
  assertEquals(m.nodes.some((n: any) => n.id === "s0_ask_set"), true)  // body 하위 set 보존
})

const emptyNlp = { intents: [], entities: [] }

Deno.test("mergeScenarioAssets: 빈 입력은 빈 자산", () => {
  const r = mergeScenarioAssets([])
  assertEquals(r.assets, { esd_schemas: [], nlp: emptyNlp, api_defs: [] })
  assertEquals(r.warnings, [])
})

Deno.test("mergeScenarioAssets: 이름으로 중복 제거하고 순서를 보존한다", () => {
  const r = mergeScenarioAssets([
    { esd_schemas: [{ name: "예약", fields: [{ name: "일자" }] }], nlp: emptyNlp, api_defs: [{ name: "A" }] },
    { esd_schemas: [{ name: "예약", fields: [{ name: "일자" }] }], nlp: emptyNlp, api_defs: [{ name: "B" }, { name: "A" }] },
  ])
  assertEquals(r.assets.esd_schemas.map((s: any) => s.name), ["예약"])
  assertEquals(r.assets.api_defs.map((d: any) => d.name), ["A", "B"])
  assertEquals(r.warnings, [])
})

Deno.test("mergeScenarioAssets: 같은 이름인데 필드가 다른 ESD는 첫 것을 쓰고 경고한다", () => {
  const r = mergeScenarioAssets([
    { esd_schemas: [{ name: "예약", fields: [{ name: "일자" }] }], nlp: emptyNlp, api_defs: [] },
    { esd_schemas: [{ name: "예약", fields: [{ name: "일자" }, { name: "인원" }] }], nlp: emptyNlp, api_defs: [] },
  ])
  assertEquals(r.assets.esd_schemas[0].fields.length, 1)
  assertEquals(r.warnings, ["ESD 스키마 '예약' 의 필드가 자산 간 다릅니다 — 먼저 고른 쪽을 씁니다."])
})

Deno.test("mergeScenarioAssets: 같은 인텐트는 examples를 합집합으로 합친다", () => {
  const r = mergeScenarioAssets([
    { esd_schemas: [], nlp: { intents: [{ name: "예약", examples: ["a", "b"] }], entities: [] }, api_defs: [] },
    { esd_schemas: [], nlp: { intents: [{ name: "예약", examples: ["b", "c"] }], entities: [] }, api_defs: [] },
  ])
  assertEquals(r.assets.nlp.intents.length, 1)
  assertEquals(r.assets.nlp.intents[0].examples, ["a", "b", "c"])
})

Deno.test("mergeScenarioAssets: 같은 엔티티는 values를 value 기준 합집합으로 합친다(주 경로)", () => {
  const r = mergeScenarioAssets([
    { esd_schemas: [], nlp: { intents: [], entities: [{ name: "메뉴", type: "synonyms", values: [{ value: "피자", synonyms: ["pizza"] }] }] }, api_defs: [] },
    { esd_schemas: [], nlp: { intents: [], entities: [{ name: "메뉴", type: "synonyms", values: [{ value: "피자", synonyms: ["pizza"] }, { value: "파스타", synonyms: [] }] }] }, api_defs: [] },
  ])
  assertEquals(r.assets.nlp.entities.length, 1)
  assertEquals(r.assets.nlp.entities[0].values.map((v: any) => v.value), ["피자", "파스타"])
})

Deno.test("mergeScenarioAssets: 이름 없는 항목과 망가진 입력은 버린다", () => {
  const r = mergeScenarioAssets([
    null as any,
    { esd_schemas: [{ name: "" }, null], nlp: { intents: [{ name: "  " }], entities: [] }, api_defs: [{}] } as any,
  ])
  assertEquals(r.assets, { esd_schemas: [], nlp: emptyNlp, api_defs: [] })
})

import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildNlpPrompt, normalizeNlpBundle, deriveNlpData } from "./deriveNlpData.ts"

const scenarios = [
  { name: "배송 조회", trigger: "언제 와요", collects: ["송장번호"], result: "배송 상태 안내" },
  { name: "주문 취소", trigger: "취소할래", collects: ["주문번호"], result: "취소 접수" },
]
const esd = [{ name: "shipping", fields: [{ name: "invoiceNo", type: "string" }] }]

Deno.test("프롬프트에 시나리오 이름과 진입 발화가 들어간다", () => {
  const p = buildNlpPrompt(scenarios, esd)
  assertStringIncludes(p, "배송 조회")
  assertStringIncludes(p, "언제 와요")
})

Deno.test("프롬프트가 엔티티 동의어에만 오타·구어 변형을 요구한다(샘플 관행)", () => {
  const p = buildNlpPrompt(scenarios, esd)
  assertStringIncludes(p, "[동의어 작성 지침 — 엔티티]")
  assertStringIncludes(p, "오타·구어 변형을 일부러 섞어라")
  // 오타 요구는 엔티티 절 안에만 있어야 한다 — 인텐트 절로 새어 나가면 예문이 오염된다.
  const intentSection = p.slice(p.indexOf("[어터런스 작성 지침 — 인텐트]"), p.indexOf("[동의어 작성 지침 — 엔티티]"))
  assertEquals(intentSection.includes("일부러 섞어라"), false)
})

Deno.test("프롬프트가 인텐트 예문의 오타를 금지한다(2026-08-28 사용자 확정)", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "인텐트 예문에는 오타를 넣지 마라")
})

Deno.test("프롬프트가 인텐트당 어터런스 20~30개를 요구한다(2026-08-28 사용자 확정)", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "어터런스(example) 20~30개")
})

Deno.test("프롬프트가 숫자만 바꾼 예문 채우기를 금지한다(dev 실측 반영)", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "같은 문장 틀에 숫자·값만 바꿔 개수를 채우지 마라")
})

Deno.test("프롬프트가 동의어를 value당 10개로 제한한다(13컬럼 절단 예방)", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "동의어는 value 하나당 최대 10개")
})

Deno.test("프롬프트가 솔루션 ID 엔티티 생성을 금지한다", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "솔루션에 등록된 레코드를 가리키는 엔티티")
})

Deno.test("프롬프트가 인텐트 간 예문 중복을 금지한다", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "다른 인텐트와 겹치는 예문을 만들지 마라")
})

Deno.test("normalize: 정상 응답을 그대로 통과시킨다", () => {
  const out = normalizeNlpBundle({
    intents: [{ name: "배송조회", examples: ["언제 와요", "어디쯤"] }],
    entities: [{ name: "배송정보", type: "synonyms", values: [{ value: "도착일", synonyms: ["언제"] }] }],
  })
  assertEquals(out.intents.length, 1)
  assertEquals(out.entities[0].values[0].value, "도착일")
})

Deno.test("normalize: 이름 없는 인텐트·엔티티는 버린다", () => {
  const out = normalizeNlpBundle({
    intents: [{ name: "", examples: ["x"] }, { name: "ok", examples: ["y"] }],
    entities: [{ name: "  ", values: [] }],
  })
  assertEquals(out.intents.length, 1)
  assertEquals(out.entities.length, 0)
})

Deno.test("normalize: examples가 없거나 배열이 아니면 빈 배열", () => {
  const out = normalizeNlpBundle({ intents: [{ name: "a" }, { name: "b", examples: "x" }] })
  assertEquals(out.intents[0].examples, [])
  assertEquals(out.intents[1].examples, [])
})

Deno.test("normalize: type이 없으면 synonyms로 채운다", () => {
  const out = normalizeNlpBundle({ entities: [{ name: "e", values: [{ value: "v", synonyms: ["s"] }] }] })
  assertEquals(out.entities[0].type, "synonyms")
})

Deno.test("normalize: type은 synonyms·patterns만 허용, 그 외는 synonyms", () => {
  const out = normalizeNlpBundle({ entities: [
    { name: "a", type: "patterns", values: [{ value: "v" }] },
    { name: "b", type: "이상한값", values: [{ value: "v" }] },
  ] })
  assertEquals(out.entities[0].type, "patterns")
  assertEquals(out.entities[1].type, "synonyms")
})

Deno.test("normalize: 인텐트 examples 중복을 순서 보존하며 제거한다", () => {
  const out = normalizeNlpBundle({
    intents: [{ name: "배송조회", examples: ["언제 와요", "어디쯤", "언제 와요", "어디쯤"] }],
  })
  assertEquals(out.intents[0].examples, ["언제 와요", "어디쯤"])
})

Deno.test("normalize: 같은 이름 인텐트가 여러 번 오면 병합하고 examples 중복을 제거한다(순서 보존)", () => {
  const out = normalizeNlpBundle({
    intents: [
      { name: "배송조회", examples: ["언제 와요", "어디쯤"] },
      { name: "주문취소", examples: ["취소할래"] },
      { name: "배송조회", examples: ["어디쯤", "도착일이 언제죠"] },
    ],
  })
  assertEquals(out.intents.length, 2)
  assertEquals(out.intents[0].name, "배송조회")
  assertEquals(out.intents[0].examples, ["언제 와요", "어디쯤", "도착일이 언제죠"])
  assertEquals(out.intents[1].name, "주문취소")
  assertEquals(out.intents[1].examples, ["취소할래"])
})

Deno.test("normalize: 같은 이름 엔티티가 여러 번 오면 병합하고, 같은 value는 합쳐 synonyms 중복을 제거한다(순서 보존)", () => {
  const out = normalizeNlpBundle({
    entities: [
      { name: "배송정보", type: "synonyms", values: [{ value: "예상도착일", synonyms: ["언제", "도착일"] }] },
      { name: "배송정보", type: "synonyms", values: [
        { value: "예상도착일", synonyms: ["도착일", "언제쯤"] },
        { value: "배송상태", synonyms: ["어디까지"] },
      ] },
    ],
  })
  assertEquals(out.entities.length, 1)
  assertEquals(out.entities[0].name, "배송정보")
  assertEquals(out.entities[0].values.length, 2)
  assertEquals(out.entities[0].values[0].value, "예상도착일")
  assertEquals(out.entities[0].values[0].synonyms, ["언제", "도착일", "언제쯤"])
  assertEquals(out.entities[0].values[1].value, "배송상태")
  assertEquals(out.entities[0].values[1].synonyms, ["어디까지"])
})

Deno.test("normalize: 같은 이름 엔티티의 type이 서로 다르면 첫 번째 것을 유지한다", () => {
  const out = normalizeNlpBundle({
    entities: [
      { name: "수량", type: "patterns", values: [{ value: "개", synonyms: ["\\d+개"] }] },
      { name: "수량", type: "synonyms", values: [{ value: "박스", synonyms: ["박스로"] }] },
    ],
  })
  assertEquals(out.entities.length, 1)
  assertEquals(out.entities[0].type, "patterns")
  assertEquals(out.entities[0].values.length, 2)
})

Deno.test("normalize: 빈/이상 입력에도 안전", () => {
  for (const bad of [null, undefined, {}, [], "x"]) {
    const out = normalizeNlpBundle(bad as any)
    assertEquals(out.intents, [])
    assertEquals(out.entities, [])
  }
})

Deno.test("deriveNlpData: LLM 응답을 정규화해 돌려준다", async () => {
  const fake = async () => JSON.stringify({
    intents: [{ name: "배송조회", examples: ["언제 와요"] }],
    entities: [],
  })
  const out = await deriveNlpData(scenarios, esd, fake)
  assertEquals(out.intents[0].name, "배송조회")
})

Deno.test("deriveNlpData: 코드펜스로 감싼 JSON도 처리한다", async () => {
  const fake = async () => '```json\n{"intents":[{"name":"a","examples":["b"]}],"entities":[]}\n```'
  const out = await deriveNlpData(scenarios, esd, fake)
  // 이름은 시나리오로 고정되므로(v0.8.1) 펜스 파싱 성공은 examples로 확인한다.
  assertEquals(out.intents[0].examples, ["b"])
  assertEquals(out.intents[0].name, "배송조회")
})

Deno.test("deriveNlpData: 시나리오가 없으면 LLM을 호출하지 않는다", async () => {
  let called = 0
  const fake = async () => { called++; return "{}" }
  const out = await deriveNlpData([], esd, fake)
  assertEquals(called, 0)
  assertEquals(out.intents, [])
})

Deno.test("deriveNlpData: 유효 JSON이지만 intents/entities가 빈 배열이면 예외 없이 빈 번들(실패 아님)", async () => {
  const fake = async () => JSON.stringify({ intents: [], entities: [] })
  const out = await deriveNlpData(scenarios, esd, fake)
  assertEquals(out.intents, [])
  assertEquals(out.entities, [])
})

Deno.test("deriveNlpData: 응답에 JSON 객체가 없으면 throw한다(조용히 빈 번들로 위장하지 않는다)", async () => {
  const fake = async () => "죄송합니다. 요청을 처리할 수 없습니다."
  await assertRejects(() => deriveNlpData(scenarios, esd, fake))
})

Deno.test("deriveNlpData: JSON.parse가 실패하면 throw한다(조용히 빈 번들로 위장하지 않는다)", async () => {
  const fake = async () => "{ this is not valid json, }"
  await assertRejects(() => deriveNlpData(scenarios, esd, fake))
})

// ── v0.8.1: 인텐트명 고정 ────────────────────────────────────────────────

Deno.test("프롬프트가 인텐트명을 고정 제시하고 새로 짓지 말라고 한다(v0.8.1)", () => {
  const p = buildNlpPrompt(scenarios, esd)
  assertStringIncludes(p, "이름을 새로 짓지 마라")
  // 시나리오명의 공백을 제거한 인텐트명이 그대로 제시돼야 한다.
  assertStringIncludes(p, "배송조회")
  assertStringIncludes(p, "주문취소")
})

Deno.test("normalize: fixedNames를 주면 LLM이 지은 이름을 순서대로 덮어쓴다", () => {
  const out = normalizeNlpBundle({
    intents: [
      { name: "예약하기", examples: ["a"] },
      { name: "확인하기", examples: ["b"] },
    ],
  }, ["배송조회", "주문취소"])
  assertEquals(out.intents.map((i) => i.name), ["배송조회", "주문취소"])
  assertEquals(out.intents[0].examples, ["a"])
})

Deno.test("normalize: LLM이 시나리오보다 많이 주면 남는 인텐트는 버린다", () => {
  const out = normalizeNlpBundle({
    intents: [{ name: "a", examples: ["1"] }, { name: "b", examples: ["2"] }, { name: "c", examples: ["3"] }],
  }, ["배송조회"])
  assertEquals(out.intents.map((i) => i.name), ["배송조회"])
})

Deno.test("normalize: LLM이 적게 주면 받은 만큼만 이름을 붙인다", () => {
  const out = normalizeNlpBundle({ intents: [{ name: "a", examples: ["1"] }] }, ["배송조회", "주문취소"])
  assertEquals(out.intents.map((i) => i.name), ["배송조회"])
})

Deno.test("normalize: fixedNames가 없으면 기존대로 LLM 이름을 쓴다(하위호환)", () => {
  const out = normalizeNlpBundle({ intents: [{ name: "예약하기", examples: ["a"] }] })
  assertEquals(out.intents[0].name, "예약하기")
})

Deno.test("deriveNlpData: 시나리오명으로 인텐트명을 고정한다(LLM 이름 무시)", async () => {
  const bundle = await deriveNlpData(scenarios, esd, () => Promise.resolve(JSON.stringify({
    intents: [{ name: "완전히다른이름", examples: ["x"] }, { name: "또다른이름", examples: ["y"] }],
    entities: [],
  })))
  assertEquals(bundle.intents.map((i) => i.name), ["배송조회", "주문취소"])
})

Deno.test("프롬프트가 갈림길을 싣고 분기마다 분류 엔티티를 요구한다(v0.8.1)", () => {
  const withBranch = [{
    name: "카드 재발급", trigger: "재발급", collects: ["카드번호"], result: "",
    branches: ["사용자가 신용카드라고 말한 경우 → 신용 절차", "사용자가 체크카드라고 말한 경우 → 체크 절차"],
  }]
  const p = buildNlpPrompt(withBranch, [])
  assertStringIncludes(p, "갈림길: 사용자가 신용카드라고 말한 경우")
  assertStringIncludes(p, "분류 엔티티를 반드시 하나 만들어라")
})

Deno.test("프롬프트: 갈림길이 없으면 (없음)으로 표기한다", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "갈림길: (없음)")
})

Deno.test("프롬프트가 증상·상황만 말하는 발화를 요구한다(실측 오분류 반영)", () => {
  const p = buildNlpPrompt(scenarios, esd)
  assertStringIncludes(p, "기능 이름을 말하지 않고 상황·증상·목적만 말하는 발화")
  assertStringIncludes(p, "세탁기가 안 돌아가요")
})

Deno.test("프롬프트가 포괄 인텐트의 일반 질문 어휘 남발을 막는다", () => {
  assertStringIncludes(buildNlpPrompt(scenarios, esd), "다른 인텐트의 발화까지 빨아들인다")
})

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildIntentPrompt, buildEntityPrompt, finalizeIntents } from "./prompts.ts"

Deno.test("buildIntentPrompt: 업무 설명이 프롬프트에 들어간다", () => {
  const p = buildIntentPrompt("반품 접수와 배송 조회를 처리하는 상담봇")
  assert(p.includes("반품 접수와 배송 조회를 처리하는 상담봇"))
})

Deno.test("buildIntentPrompt: 어터런스 지침이 붙는다", () => {
  const p = buildIntentPrompt("아무 설명")
  assert(p.includes("[어터런스 작성 지침 — 인텐트]"))
})

Deno.test("buildIntentPrompt: 엔티티를 만들라고 하지 않는다(1단계는 인텐트만)", () => {
  const p = buildIntentPrompt("아무 설명")
  assertEquals(p.includes('"entities"'), false)
})

// 순차 의존의 실체 — 확정 인텐트가 하나라도 빠지면 v0.8.1의 실패 모드가 재현된다.
Deno.test("buildEntityPrompt: 확정 인텐트가 이름·예문 모두 프롬프트에 들어간다", () => {
  const intents = [
    { name: "반품접수", examples: ["반품할래요", "사이즈가 안 맞아요"] },
    { name: "배송조회", examples: ["언제 와요?", "물건이 아직 안 왔어요"] },
  ]
  const p = buildEntityPrompt("상담봇", intents)
  for (const it of intents) {
    assert(p.includes(it.name), `인텐트 ${it.name}이 빠졌다`)
    for (const ex of it.examples) {
      assert(p.includes(ex), `예문 "${ex}"이 빠졌다`)
    }
  }
})

Deno.test("buildEntityPrompt: 예문이 없는 인텐트도 이름은 들어간다", () => {
  const p = buildEntityPrompt("상담봇", [{ name: "매장안내", examples: [] }])
  assert(p.includes("매장안내"))
  assert(p.includes("(예문 없음)"))
})

Deno.test("buildEntityPrompt: 인텐트를 만들라고 하지 않는다(2단계는 엔티티만)", () => {
  const p = buildEntityPrompt("상담봇", [{ name: "반품접수", examples: ["반품"] }])
  assertEquals(p.includes('"intents"'), false)
})

Deno.test("finalizeIntents: LLM이 지은 한글명을 기존 규칙으로 정규화한다", () => {
  const out = finalizeIntents({ intents: [{ name: "반품 접수", examples: ["반품할래요"] }] })
  assertEquals(out[0].name, "반품접수")
})

Deno.test("finalizeIntents: 이름이 겹치면 _2를 붙인다", () => {
  const out = finalizeIntents({
    intents: [
      { name: "예약 변경", examples: ["a"] },
      { name: "예약변경", examples: ["b"] },
    ],
  })
  assertEquals(out.map((i) => i.name), ["예약변경", "예약변경_2"])
})

Deno.test("finalizeIntents: 특수문자만 있는 이름은 버린다(솔루션이 받을 수 없다)", () => {
  const out = finalizeIntents({
    intents: [{ name: "///", examples: ["a"] }, { name: "배송 조회", examples: ["b"] }],
  })
  assertEquals(out.map((i) => i.name), ["배송조회"])
})

Deno.test("finalizeIntents: 예문 중복을 제거한다", () => {
  const out = finalizeIntents({ intents: [{ name: "반품", examples: ["같은말", "같은말", "다른말"] }] })
  assertEquals(out[0].examples, ["같은말", "다른말"])
})

Deno.test("finalizeIntents: intents가 없으면 빈 배열", () => {
  assertEquals(finalizeIntents({}), [])
  assertEquals(finalizeIntents(null), [])
})

// I1 — 도구 경로에는 시나리오도 수집 항목도 없다. 공유 지침이 그 어휘를 실어 오면
// LLM에게 존재하지 않는 입력에서 뽑으라고 지시하는 셈이다.
Deno.test("도구 프롬프트에 시나리오 전용 어휘가 실리지 않는다", () => {
  const prompts = [
    buildIntentPrompt("반품 접수를 처리하는 상담봇"),
    buildEntityPrompt("반품 접수를 처리하는 상담봇", [{ name: "반품접수", examples: ["반품할래요"] }]),
  ]
  for (const p of prompts) {
    assertEquals(p.includes("시나리오"), false, "도구 프롬프트에 '시나리오'가 들어갔다")
    assertEquals(p.includes("수집 항목"), false, "도구 프롬프트에 '수집 항목'이 들어갔다")
  }
})

// 정의 문장 자체는 두 경로가 공유한다 — 분할선은 "어디서 뽑는가"뿐이다.
Deno.test("buildEntityPrompt: 분류 엔티티 정의 문장은 공유 상수 그대로다", () => {
  const p = buildEntityPrompt("상담봇", [{ name: "반품접수", examples: ["반품"] }])
  assert(p.includes(`- 분류 엔티티(type "synonyms"): 인텐트 안에서 무엇을 묻는지 가른다.`))
  assert(p.includes(`예: 엔티티 "배송정보"의 value가 "예상도착일"·"배송상태".`))
})

// I3 — 2단계에서 사용자가 편집한 이름이 그대로 CSV로 가지 않도록, entities 왕복에서
// 서버가 같은 함수로 재정규화한다(화면에는 이름 규칙을 복제하지 않는다).
Deno.test("finalizeIntents: 화면에서 편집한 이름(공백·슬래시)을 재정규화한다", () => {
  const out = finalizeIntents({
    intents: [
      { name: "반품 접수", examples: ["반품할래요"] },
      { name: "반품/교환", examples: ["교환할래요"] },
    ],
  })
  assertEquals(out.map((i) => i.name), ["반품접수", "반품교환"])
  // 예문은 손대지 않는다 — 이름만 규칙에 맞춘다.
  assertEquals(out.map((i) => i.examples), [["반품할래요"], ["교환할래요"]])
})

Deno.test("finalizeIntents: 이미 정규 이름이면 그대로 둔다(왕복해도 안정적)", () => {
  const once = finalizeIntents({ intents: [{ name: "반품 접수", examples: ["a"] }] })
  const twice = finalizeIntents({ intents: once })
  assertEquals(twice, once)
})

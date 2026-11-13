import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { validateRequest } from "./validate.ts"

Deno.test("validateRequest: 정상 intents 요청", () => {
  assertEquals(validateRequest({ step: "intents", description: "상담봇" }), null)
})

Deno.test("validateRequest: 정상 entities 요청", () => {
  const body = { step: "entities", description: "상담봇", intents: [{ name: "반품접수", examples: ["a"] }] }
  assertEquals(validateRequest(body), null)
})

Deno.test("validateRequest: 모르는 step", () => {
  assertEquals(validateRequest({ step: "both", description: "x" }), "step은 'intents' 또는 'entities'만 지원합니다.")
  assertEquals(validateRequest({ description: "x" }), "step은 'intents' 또는 'entities'만 지원합니다.")
})

Deno.test("validateRequest: 설명 없음·공백만", () => {
  assertEquals(validateRequest({ step: "intents" }), "업무 설명이 필요합니다.")
  assertEquals(validateRequest({ step: "intents", description: "   " }), "업무 설명이 필요합니다.")
})

Deno.test("validateRequest: entities인데 인텐트가 비었다", () => {
  const msg = "확정한 인텐트가 필요합니다."
  assertEquals(validateRequest({ step: "entities", description: "x" }), msg)
  assertEquals(validateRequest({ step: "entities", description: "x", intents: [] }), msg)
})

Deno.test("validateRequest: body가 null이어도 터지지 않는다", () => {
  assertEquals(validateRequest(null), "step은 'intents' 또는 'entities'만 지원합니다.")
})

// I2 — 이름이 빈 인텐트를 통과시키면 index.ts의 .filter()가 그것을 조용히 버린다.
// 인텐트가 1개뿐이었다면 확정 인텐트 섹션이 통째로 빈 채 LLM에 가고(v0.8.1 실패 모드),
// 사용자에게는 정상 결과로 보인다. 검증에서 400으로 되돌린다.
Deno.test("validateRequest: entities인데 이름이 빈 인텐트가 섞였다", () => {
  const msg = "이름이 비어 있는 인텐트가 있습니다."
  assertEquals(
    validateRequest({
      step: "entities",
      description: "x",
      intents: [{ name: "반품접수", examples: ["a"] }, { name: "", examples: ["b"] }],
    }),
    msg,
  )
  // 공백만 있는 이름도 같다 — 서버가 trim한 뒤 버린다.
  assertEquals(
    validateRequest({ step: "entities", description: "x", intents: [{ name: "   ", examples: ["a"] }] }),
    msg,
  )
  // name 자체가 없는 경우도 같다.
  assertEquals(
    validateRequest({ step: "entities", description: "x", intents: [{ examples: ["a"] }] }),
    msg,
  )
})

Deno.test("validateRequest: entities 인텐트 이름이 전부 정상이면 통과", () => {
  assertEquals(
    validateRequest({
      step: "entities",
      description: "x",
      intents: [{ name: "반품접수", examples: ["a"] }, { name: "배송조회", examples: ["b"] }],
    }),
    null,
  )
})

// intents 단계는 인텐트를 보내지 않는다 — 빈 이름 검사에 걸리면 안 된다.
Deno.test("validateRequest: intents 단계는 인텐트 이름 검사를 하지 않는다", () => {
  assertEquals(validateRequest({ step: "intents", description: "x", intents: [{ name: "" }] }), null)
})

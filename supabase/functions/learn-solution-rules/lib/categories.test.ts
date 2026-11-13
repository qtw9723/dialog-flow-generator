import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { stagesForCategory, relevantExistingRules, isValidCategory } from "./categories.ts"

Deno.test("stagesForCategory: 매핑된 단계 반환, 미지 카테고리는 빈 배열", () => {
  // ⚠ 이 테스트는 원래 learn의 **복제본**을 기준으로 3단계를 기대하고 있었다.
  // 본체(dialogflow-generator/flow/rules.ts)는 condition까지 포함한다 — 복제가 어긋난 증거였다.
  // 2026-08-28 _shared로 통합하며 본체 기준으로 정정.
  assertEquals(stagesForCategory("Variable Usage Rule"), ["flow", "config", "output", "condition"])
  assertEquals(stagesForCategory("Condition Rule"), ["condition"])
  assertEquals(stagesForCategory("System Variable"), [])
  assertEquals(stagesForCategory("nope"), [])
})

Deno.test("relevantExistingRules: 같은 stage 겹치는 기존 규칙만", () => {
  const existing = [
    { id: "1", category: "Condition Rule", title: "조건A" },
    { id: "2", category: "Output Message Rule", title: "멘트B" },
    { id: "3", category: "Value Generation Rule", title: "값C" },
  ]
  assertEquals(relevantExistingRules("Condition Rule", existing).map((r) => r.id), ["1"])
  // Variable Usage Rule이 condition 단계에도 주입되므로 조건 규칙과도 겹친다(통합 후 정정).
  // 변수 규칙이 조건 프롬프트에 들어가는 이상, 조건 규칙과의 충돌도 정합화 대상이 맞다.
  assertEquals(relevantExistingRules("Variable Usage Rule", existing).map((r) => r.id), ["1", "2", "3"])
  assertEquals(relevantExistingRules("System Variable", existing), [])
})

Deno.test("isValidCategory: _shared 목록(9종)을 따른다", () => {
  assertEquals(isValidCategory("Condition Rule"), true)
  assertEquals(isValidCategory("Made Up"), false)
  // 복제가 놓쳤던 두 카테고리 — 학습이 이것들을 '유효하지 않다'고 판단하고 있었다.
  assertEquals(isValidCategory("Loop Rule"), true)
  assertEquals(isValidCategory("NLP Function Reference"), true)
})

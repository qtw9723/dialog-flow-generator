import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { ruleText, groupRulesByStage, RULE_STAGE_BY_CATEGORY } from "./rules.ts"

Deno.test("ruleText: description 우선, content.text·문자열 content 폴백", () => {
  assertEquals(ruleText({ description: "규칙 본문" }), "규칙 본문")
  assertEquals(ruleText({ content: { text: "콘텐츠 텍스트" } }), "콘텐츠 텍스트")
  assertEquals(ruleText({ content: "문자열 콘텐츠" }), "문자열 콘텐츠")
  assertEquals(ruleText({ description: "  " , content: { text: "폴백" } }), "폴백")
  assertEquals(ruleText({}), "")
})

Deno.test("groupRulesByStage: 카테고리→단계 매핑, order_index 정렬, title 포함", () => {
  const rows = [
    { category: "Node Usage Rule", title: "분기", description: "분기는 condition", order_index: 2 },
    { category: "Node Usage Rule", title: "greeting", description: "greeting 단일 루트", order_index: 1 },
    { category: "Variable Usage Rule", title: "선언", description: "앞에서 선언", order_index: 0 },
    { category: "Value Generation Rule", title: "난수", description: "예약번호 난수", order_index: 0 },
    { category: "Output Message Rule", title: "필드", description: "나열된 필드만", order_index: 0 },
    { category: "Condition Rule", title: "트리거", description: "진입 트리거", order_index: 0 },
  ]
  const g = groupRulesByStage(rows)
  // flow: Node Usage(정렬: greeting→분기) + Variable Usage
  assertEquals(g.flow, ["- 선언: 앞에서 선언", "- greeting: greeting 단일 루트", "- 분기: 분기는 condition"])
  // Variable Usage Rule은 config·output에도
  assertEquals(g.config, ["- 선언: 앞에서 선언", "- 난수: 예약번호 난수"])
  assertEquals(g.output, ["- 선언: 앞에서 선언", "- 필드: 나열된 필드만"])
  // Variable Usage Rule은 condition에도(분기 조건이 변수명을 쓰도록) — 선언이 트리거보다 앞(둘 다 order 0, 안정정렬)
  assertEquals(g.condition, ["- 선언: 앞에서 선언", "- 트리거: 진입 트리거"])
})

Deno.test("groupRulesByStage: 텍스트 없는 행·미지 카테고리 무시", () => {
  const g = groupRulesByStage([
    { category: "Node Usage Rule", title: "빈규칙" },           // 텍스트 없음 → 무시
    { category: "Unknown Category", description: "어딘가" },     // 미지 카테고리 → 무시
    { category: "System Variable", description: "시스템변수" },  // 매핑에 없음 → 무시
  ])
  assertEquals(g.flow, [])
  assertEquals(g.config, [])
})

Deno.test("RULE_STAGE_BY_CATEGORY: Variable Usage Rule은 다단계", () => {
  assertEquals(RULE_STAGE_BY_CATEGORY["Variable Usage Rule"], ["flow", "config", "output", "condition"])
  assertEquals(RULE_STAGE_BY_CATEGORY["Condition Rule"], ["condition"])
})

Deno.test("NLP Function Reference는 condition 단계에만 주입된다(v0.8.1)", () => {
  // v0.8.0에서는 일부러 미매핑이었다 — 조건이 아직 intent()를 쓰지 않는데 규약만 주입하면
  // 학습 안 된 인텐트를 참조하는 봇이 나온다. v0.8.1에서 조건을 전환하면서 매핑을 연다.
  // 다른 단계로 새면 flow·config·output 프롬프트가 조건 함수 규약으로 오염된다.
  assertEquals(RULE_STAGE_BY_CATEGORY["NLP Function Reference"], ["condition"])
})

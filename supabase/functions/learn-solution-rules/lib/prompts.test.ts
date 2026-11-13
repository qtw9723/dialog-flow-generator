import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildDerivePrompt, buildReconcilePrompt, parseLlm } from "./prompts.ts"

Deno.test("buildDerivePrompt: 입력과 카테고리 목록 포함", () => {
  const p = buildDerivePrompt("text", "_result는 노드 밖에서 쓰지 마라")
  assertStringIncludes(p, "_result는 노드 밖에서 쓰지 마라")
  assertStringIncludes(p, "Condition Rule")
})

Deno.test("buildDerivePrompt: json 소스는 안티패턴 교정 지시 포함", () => {
  const p = buildDerivePrompt("json", '{"x":1}')
  assertStringIncludes(p, '{"x":1}')
  assertStringIncludes(p, "교정")
})

Deno.test("buildReconcilePrompt: 후보·기존 규칙 제목 포함", () => {
  const p = buildReconcilePrompt(
    [{ category: "Variable Usage Rule", title: "스코프는 공유범위", description: "..." }],
    [{ id: "9", category: "Value Generation Rule", title: "set 변수 명명·스코프", description: "개인정보=local" }],
  )
  assertStringIncludes(p, "스코프는 공유범위")
  assertStringIncludes(p, "set 변수 명명·스코프")
  assertStringIncludes(p, "9")
})

Deno.test("parseLlm: 코드펜스/잡텍스트에서 JSON 추출", () => {
  assertEquals(parseLlm('```json\n{"a":1}\n```').a, 1)
  assertEquals(parseLlm('말머리 {"b":2} 꼬리').b, 2)
  assertEquals(parseLlm("쓰레기"), null)
})

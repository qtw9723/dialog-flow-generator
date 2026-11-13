import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { normalizeLoopExitVars } from "./normalizeLoopExit.ts"

// flag-loop subflow: 본문(ask→save→flag)에서 flag set이 루프 exitVar와 다른 변수를 쓰는 상황.
function flagLoopJson(flagKey: string, flagValue = "true"): any {
  return {
    dialogs: [
      {
        id: "main",
        then: ["enter", "fallback"],
        nodes: [
          { id: "enter", type: "node", then: ["loop1__init"] },
          { id: "loop1__init", type: "set", then: ["loop1"], config: { items: [{ key: "context.done", value: "false", condition: "" }] } },
          { id: "loop1", type: "subflow", body: ["ask"], then: ["after"], config: { loop: { count: "10", condition: "context.done" } } },
          { id: "ask", type: "output", then: ["save"], config: { items: [{ type: "text", text: [{ texts: ["입력?"] }] }] } },
          { id: "save", type: "set", then: ["decide"], config: { items: [{ key: "local.menu", value: "input.text", condition: "" }] } },
          { id: "decide", type: "node", then: ["flag"], config: {} },
          { id: "flag", type: "set", then: [], condition: "local.menu == '그만'", config: { items: [{ key: flagKey, value: flagValue, condition: "" }] } },
          { id: "after", type: "output", then: [], config: { items: [] } },
        ],
      },
    ],
  }
}

const flagSet = (json: any) => json.dialogs[0].nodes.find((n: any) => n.id === "flag")
const saveSet = (json: any) => json.dialogs[0].nodes.find((n: any) => n.id === "save")

Deno.test("normalize: 본문 flag set이 exitVar와 다르면 exitVar로 맞춘다", () => {
  const json = flagLoopJson("local.doneFlag")
  const { normalized } = normalizeLoopExitVars(json)
  assertEquals(normalized, 1)
  assertEquals(flagSet(json).config.items[0].key, "context.done")  // 탈출 조건과 일치
})

Deno.test("normalize: 데이터 저장 set(value=input.text)은 건드리지 않는다", () => {
  const json = flagLoopJson("local.doneFlag")
  normalizeLoopExitVars(json)
  assertEquals(saveSet(json).config.items[0].key, "local.menu")  // 그대로
})

Deno.test("normalize: 이미 exitVar를 쓰면 변경 없음(멱등)", () => {
  const json = flagLoopJson("context.done")
  const { normalized } = normalizeLoopExitVars(json)
  assertEquals(normalized, 0)
  assertEquals(flagSet(json).config.items[0].key, "context.done")
  // 두 번 돌려도 동일
  assertEquals(normalizeLoopExitVars(json).normalized, 0)
})

Deno.test("normalize: 'var == true' 스타일 condition도 exitVar 파싱", () => {
  const json = flagLoopJson("local.doneFlag")
  json.dialogs[0].nodes.find((n: any) => n.id === "loop1").config.loop.condition = "context.done == true"
  const { normalized } = normalizeLoopExitVars(json)
  assertEquals(normalized, 1)
  assertEquals(flagSet(json).config.items[0].key, "context.done")
})

Deno.test("normalize: 검증 루프(식 condition with .match)는 스킵", () => {
  const json = flagLoopJson("local.doneFlag")
  json.dialogs[0].nodes.find((n: any) => n.id === "loop1").config.loop.condition = "local.phone.match(/^[0-9-]+$/)"
  const { normalized } = normalizeLoopExitVars(json)
  assertEquals(normalized, 0)                                    // 건드리지 않음
  assertEquals(flagSet(json).config.items[0].key, "local.doneFlag")
})

Deno.test("normalize: 라이브 케이스(0847a038) 재현 — local.doneFlag → context.done", () => {
  const json = flagLoopJson("local.doneFlag", "true")
  const { normalized } = normalizeLoopExitVars(json)
  assert(normalized >= 1)
  // 본문 어딘가에서 exitVar를 set → 런타임 탈출 가능
  const sets = json.dialogs[0].nodes.filter((n: any) => n.type === "set" && n.id !== "loop1__init")
  assert(sets.some((s: any) => s.config.items.some((it: any) => it.key === "context.done")))
})

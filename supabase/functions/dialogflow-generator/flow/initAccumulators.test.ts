import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { initLoopAccumulators } from "./initAccumulators.ts"

const main = (j: any) => j.dialogs.find((d: any) => d.id === "main")
const byId = (j: any, id: string) => main(j).nodes.find((n: any) => n.id === id)
const wrap = (nodes: any[], then: string[]) => ({ dialogs: [{ id: "main", then, nodes }] })

Deno.test("기존 __init에 누적 배열 []가 추가된다", () => {
  const j = wrap([
    { id: "loop1__init", type: "set", then: ["loop1"], config: { items: [{ key: "context.done", value: "false", condition: "" }] } },
    { id: "loop1", type: "subflow", body: ["ask"], then: ["after"], config: { loop: { condition: "context.done", count: "10" } } },
    { id: "ask", type: "output", then: ["acc"] },
    { id: "acc", type: "set", then: [], config: { items: [{ key: "local.menu", value: "local.menu.concat([input.text])", condition: "" }] } },
    { id: "after", type: "output", then: [] },
  ], ["loop1__init"])
  const { initialized } = initLoopAccumulators(j)
  assertEquals(initialized, 1)
  const items = byId(j, "loop1__init").config.items
  assert(items.some((it: any) => it.key === "local.menu" && it.value === "[]"))
  // 기존 exitVar init은 보존
  assert(items.some((it: any) => it.key === "context.done"))
})

Deno.test("멱등: 이미 []가 있으면 추가 안 함", () => {
  const j = wrap([
    { id: "loop1__init", type: "set", then: ["loop1"], config: { items: [{ key: "local.menu", value: "[]", condition: "" }] } },
    { id: "loop1", type: "subflow", body: ["acc"], then: [], config: { loop: { condition: "context.done", count: "10" } } },
    { id: "acc", type: "set", then: [], config: { items: [{ key: "local.menu", value: "local.menu.concat([input.text])", condition: "" }] } },
  ], ["loop1__init"])
  const { initialized } = initLoopAccumulators(j)
  assertEquals(initialized, 0)
})

Deno.test("__init이 없으면 만들어 부모를 재배선한다", () => {
  const j = wrap([
    { id: "p", type: "output", then: ["loop1"] },
    { id: "loop1", type: "subflow", body: ["acc"], then: [], config: { loop: { condition: "context.done", count: "10" } } },
    { id: "acc", type: "set", then: [], config: { items: [{ key: "local.items", value: "local.items.concat([input.text])", condition: "" }] } },
  ], ["p"])
  const { initialized } = initLoopAccumulators(j)
  assertEquals(initialized, 1)
  const init = byId(j, "loop1__init")
  assert(init, "init 노드 생성")
  assertEquals(init.then, ["loop1"])
  assertEquals(byId(j, "p").then, ["loop1__init"])  // 부모가 init을 가리키도록 재배선
  assert(init.config.items.some((it: any) => it.key === "local.items" && it.value === "[]"))
})

Deno.test("concat 누적이 없으면 아무것도 안 한다", () => {
  const j = wrap([
    { id: "loop1__init", type: "set", then: ["loop1"], config: { items: [{ key: "context.done", value: "false", condition: "" }] } },
    { id: "loop1", type: "subflow", body: ["s"], then: [], config: { loop: { condition: "context.done", count: "10" } } },
    { id: "s", type: "set", then: [], config: { items: [{ key: "local.x", value: "input.text", condition: "" }] } },
  ], ["loop1__init"])
  const { initialized } = initLoopAccumulators(j)
  assertEquals(initialized, 0)
})

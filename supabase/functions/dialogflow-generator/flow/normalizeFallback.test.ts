import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { normalizeFallback } from "./normalizeFallback.ts"

const main = (j: any) => j.dialogs.find((d: any) => d.id === "main")
const ids = (j: any) => main(j).nodes.map((n: any) => n.id)
const byId = (j: any, id: string) => main(j).nodes.find((n: any) => n.id === id)

function wrap(nodes: any[], then: string[]) {
  return { dialogs: [{ id: "main", then, nodes }] }
}

const BOILERPLATE = [
  { id: "fallback", type: "fallback", label: "Fallback", body: [], then: ["fallback_out"], actions: [] },
  { id: "fallback_out", type: "output", then: [], config: { items: [] } },
]

Deno.test("보일러플레이트 fallback(id=fallback)는 그대로 보존", () => {
  const j = wrap([...BOILERPLATE], ["fallback"])
  const { converted, removed } = normalizeFallback(j)
  assertEquals(converted, 0)
  assertEquals(removed, 0)
  assertEquals(byId(j, "fallback").type, "fallback")
  assertEquals(byId(j, "fallback").then, ["fallback_out"])
})

Deno.test("자식 없는 비보일러플레이트 fallback는 제거되고 부모 then에서 참조가 사라진다", () => {
  const j = wrap([
    { id: "n6", type: "node", condition: "true", then: ["n7", "n8"] },
    { id: "n7", type: "llmchat", then: [], config: {} },
    { id: "n8", type: "fallback", label: "매칭되지 않은 입력", condition: "true", then: [] },
    ...BOILERPLATE,
  ], ["n6", "fallback"])
  const { converted, removed } = normalizeFallback(j)
  assertEquals(removed, 1)
  assertEquals(converted, 0)
  assert(!ids(j).includes("n8"))
  assertEquals(byId(j, "n6").then, ["n7"])
  // 보일러플레이트는 무사
  assertEquals(byId(j, "fallback").type, "fallback")
})

Deno.test("자식 있는 비보일러플레이트 fallback는 컨디션 노드(node)로 전환된다", () => {
  const j = wrap([
    { id: "br", type: "node", condition: "true", then: ["a", "ae1"] },
    { id: "a", type: "output", condition: "input.text.includes('x')", then: [] },
    { id: "ae1", type: "fallback", label: "기타 처리", then: ["out1"] },
    { id: "out1", type: "output", then: [] },
    ...BOILERPLATE,
  ], ["br", "fallback"])
  const { converted, removed } = normalizeFallback(j)
  assertEquals(converted, 1)
  assertEquals(removed, 0)
  const n = byId(j, "ae1")
  assertEquals(n.type, "node")           // else 분기는 다른 노드의 조건 처리로
  assertEquals(n.condition, "true")      // 조건 비어 있으면 catch-all 조건 부여
  assertEquals(n.then, ["out1"])         // 자식 유지
})

Deno.test("dialog.then(루트)에 있는 비보일러플레이트 fallback도 정리된다", () => {
  const j = wrap([
    { id: "w", type: "greeting", then: [] },
    { id: "ae2", type: "fallback", then: [] },
    ...BOILERPLATE,
  ], ["w", "ae2", "fallback"])
  const { removed } = normalizeFallback(j)
  assertEquals(removed, 1)
  assertEquals(main(j).then, ["w", "fallback"])
})

Deno.test("기존 조건이 있는 fallback 전환 시 조건을 보존한다", () => {
  const j = wrap([
    { id: "ae3", type: "fallback", condition: "local.flag == true", then: ["o"] },
    { id: "o", type: "output", then: [] },
    ...BOILERPLATE,
  ], ["ae3", "fallback"])
  normalizeFallback(j)
  assertEquals(byId(j, "ae3").condition, "local.flag == true")
})

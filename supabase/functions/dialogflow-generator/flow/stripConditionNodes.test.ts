import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { stripMeaninglessConditionNodes } from "./stripConditionNodes.ts"

const main = (j: any) => j.dialogs.find((d: any) => d.id === "main")
const ids = (j: any) => main(j).nodes.map((n: any) => n.id)
const byId = (j: any, id: string) => main(j).nodes.find((n: any) => n.id === id)

function wrap(nodes: any[], then: string[]) {
  return { dialogs: [{ id: "main", then, nodes }] }
}

Deno.test("빈 condition + 잎 + 비루트 컨디션 노드는 제거되고 부모 참조가 정리된다", () => {
  const j = wrap([
    { id: "n7", type: "output", then: ["n8"] },
    { id: "n8", type: "set", then: ["n9"] },
    { id: "n9", type: "node", condition: "", then: [] },  // 빈 컨디션 잎 → 제거
  ], ["n7"])
  const { removed } = stripMeaninglessConditionNodes(j)
  assertEquals(removed, 1)
  assert(!ids(j).includes("n9"))
  assertEquals(byId(j, "n8").then, [])   // 잎 제거 → 부모 then에서 사라짐
})

Deno.test("비루트 + 자식1 + 빈 condition은 splice(부모→자식 연결)", () => {
  const j = wrap([
    { id: "a", type: "output", then: ["mid"] },
    { id: "mid", type: "node", condition: "", then: ["b"] },  // 통과용 → splice
    { id: "b", type: "output", then: [] },
  ], ["a"])
  const { removed } = stripMeaninglessConditionNodes(j)
  assertEquals(removed, 1)
  assert(!ids(j).includes("mid"))
  assertEquals(byId(j, "a").then, ["b"])  // 부모가 자식으로 직접 연결
})

Deno.test("분기 노드(자식 2 이상)는 condition이 비어도 보존", () => {
  const j = wrap([
    { id: "a", type: "output", then: ["br"] },
    { id: "br", type: "node", condition: "", then: ["x", "y"] },  // 분기 → 보존
    { id: "x", type: "set", condition: "input.text == '1'", then: [] },
    { id: "y", type: "set", condition: "input.text == '2'", then: [] },
  ], ["a"])
  const { removed } = stripMeaninglessConditionNodes(j)
  assertEquals(removed, 0)
  assert(ids(j).includes("br"))
})

Deno.test("진입 루트 컨디션 노드는 condition이 비어도 보존", () => {
  const j = wrap([
    { id: "entry", type: "node", condition: "", then: ["s1"] },  // 루트(진입) → 보존
    { id: "s1", type: "output", then: [] },
  ], ["entry"])
  const { removed } = stripMeaninglessConditionNodes(j)
  assertEquals(removed, 0)
  assert(ids(j).includes("entry"))
})

Deno.test("condition이 채워진 비루트 가드 노드는 보존(보수적)", () => {
  const j = wrap([
    { id: "a", type: "output", then: ["guard"] },
    { id: "guard", type: "node", condition: "local.ok == true", then: ["b"] },  // 실제 조건 → 보존
    { id: "b", type: "output", then: [] },
  ], ["a"])
  const { removed } = stripMeaninglessConditionNodes(j)
  assertEquals(removed, 0)
  assert(ids(j).includes("guard"))
})

Deno.test("연쇄: splice 후 잎이 된 노드도 수렴할 때까지 제거", () => {
  const j = wrap([
    { id: "a", type: "output", then: ["m1"] },
    { id: "m1", type: "node", condition: "", then: ["m2"] },  // → splice
    { id: "m2", type: "node", condition: "", then: [] },      // 잎 → 제거
  ], ["a"])
  const { removed } = stripMeaninglessConditionNodes(j)
  assertEquals(removed, 2)
  assertEquals(byId(j, "a").then, [])
})

Deno.test("loop body 참조도 splice 대상에 포함된다", () => {
  const j = wrap([
    { id: "lp", type: "subflow", body: ["m"], then: ["after"], config: { loop: { condition: "context.done", count: "10" } } },
    { id: "m", type: "node", condition: "", then: ["real"] },  // body 진입이 빈 컨디션 → splice
    { id: "real", type: "output", then: [] },
    { id: "after", type: "output", then: [] },
  ], ["lp"])
  const { removed } = stripMeaninglessConditionNodes(j)
  assertEquals(removed, 1)
  assertEquals(byId(j, "lp").body, ["real"])  // body가 자식으로 재연결
})

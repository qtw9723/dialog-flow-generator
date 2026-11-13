import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { planApply } from "./apply.ts"

const c = (text: string) => ({ text })

Deno.test("add: insert + order_index = 같은 카테고리 max+10", () => {
  const plan = planApply(
    [{ decision: "add", category: "Condition Rule", title: "t", description: "d", content: c("s") }],
    [{ id: "1", category: "Condition Rule", order_index: 30 }],
  )
  assertEquals(plan.errors, [])
  assertEquals(plan.ops[0], { op: "insert", row: { category: "Condition Rule", title: "t", description: "d", content: c("s"), order_index: 40 } })
})

Deno.test("add: 같은 카테고리 없으면 order_index=10, 배치 내 누적 증가", () => {
  const plan = planApply([
    { decision: "add", category: "Condition Rule", title: "a", description: "d", content: c("s") },
    { decision: "add", category: "Condition Rule", title: "b", description: "d", content: c("s") },
  ], [])
  assertEquals((plan.ops[0] as any).row.order_index, 10)
  assertEquals((plan.ops[1] as any).row.order_index, 20)
})

Deno.test("replace/edit: targetRuleId update", () => {
  const plan = planApply([
    { decision: "replace", category: "Variable Usage Rule", title: "t", description: "new", content: c("s"), targetRuleId: "9" },
    { decision: "edit", category: "Variable Usage Rule", title: "t", description: "edited", content: c("s2"), targetRuleId: "9" },
  ], [])
  assertEquals(plan.ops[0], { op: "update", id: "9", patch: { description: "new", content: c("s") } })
  assertEquals(plan.ops[1], { op: "update", id: "9", patch: { description: "edited", content: c("s2") } })
})

Deno.test("edit without target → insert", () => {
  const plan = planApply(
    [{ decision: "edit", category: "Condition Rule", title: "t", description: "d", content: c("s") }],
    [],
  )
  assertEquals((plan.ops[0] as any).op, "insert")
})

Deno.test("skip → skip op", () => {
  const plan = planApply([{ decision: "skip", category: "Condition Rule", title: "t", description: "d", content: c("s") }], [])
  assertEquals(plan.ops[0], { op: "skip" })
})

Deno.test("검증: replace인데 target 없음 / 잘못된 category → error", () => {
  const p1 = planApply([{ decision: "replace", category: "Condition Rule", title: "t", description: "d", content: c("s") }], [])
  assertEquals(p1.errors.length, 1)
  const p2 = planApply([{ decision: "add", category: "Bogus", title: "t", description: "d", content: c("s") }], [])
  assertEquals(p2.errors.length, 1)
})

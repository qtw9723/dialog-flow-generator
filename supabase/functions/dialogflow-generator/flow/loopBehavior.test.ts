import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { resolveLoopBehavior, exitCondition, DEFAULT_LOOP_BEHAVIOR } from "./loopBehavior.ts"

Deno.test("resolveLoopBehavior: 행 부재 시 기본값", () => {
  assertEquals(resolveLoopBehavior([]), DEFAULT_LOOP_BEHAVIOR)
  assertEquals(DEFAULT_LOOP_BEHAVIOR, { exitCompare: "truthy", autoInitFlag: true, defaultMax: 10 })
})

Deno.test("resolveLoopBehavior: 설정 행 파싱", () => {
  const b = resolveLoopBehavior([
    { category: "Loop Rule", title: "루프 동작 설정",
      content: { exitCompare: "truthy", autoInitFlag: false, defaultMax: 5 } },
  ])
  assertEquals(b, { exitCompare: "truthy", autoInitFlag: false, defaultMax: 5 })
})

Deno.test("resolveLoopBehavior: 잘못된 값은 기본값으로 폴백", () => {
  const b = resolveLoopBehavior([
    { category: "Loop Rule", title: "루프 동작 설정",
      content: { exitCompare: "nonsense", autoInitFlag: "x", defaultMax: 0 } },
  ])
  assertEquals(b, DEFAULT_LOOP_BEHAVIOR)
})

Deno.test("exitCondition: 비교 스타일", () => {
  assertEquals(exitCondition("_user.done", { exitCompare: "== true", autoInitFlag: true, defaultMax: 10 }), "_user.done == true")
  assertEquals(exitCondition("_user.done", { exitCompare: "truthy", autoInitFlag: true, defaultMax: 10 }), "_user.done")
})

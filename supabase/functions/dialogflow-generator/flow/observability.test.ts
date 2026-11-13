import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { sha256Hex, buildRulesSnapshot, buildScenarioExamplesMeta } from "./observability.ts"
import { groupRulesByStage } from "./rules.ts"

const ROWS = [
  { category: "Solution Rule", title: "인사", description: "greeting으로 시작", order_index: 1 },
  { category: "Condition Rule", title: "분기", description: "변수명으로 분기", order_index: 2 },
  { category: "Variable Usage Rule", title: "변수", description: "항목명 금지", order_index: 3 },
]

Deno.test("sha256Hex: 빈 문자열 known vector", async () => {
  assertEquals(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  )
})

Deno.test("buildRulesSnapshot: 행 순서가 달라도 hash 동일", async () => {
  const byStage = groupRulesByStage(ROWS as any[])
  const a = await buildRulesSnapshot(ROWS as any[], byStage, "", "gpt-4o")
  const b = await buildRulesSnapshot([ROWS[2], ROWS[0], ROWS[1]] as any[], byStage, "", "gpt-4o")
  assertEquals(a.hash, b.hash)
})

Deno.test("buildRulesSnapshot: Condition Rule 수정 → condition 스테이지 해시만 변경", async () => {
  const before = await buildRulesSnapshot(ROWS as any[], groupRulesByStage(ROWS as any[]), "", "gpt-4o")
  const edited = ROWS.map((r) =>
    r.category === "Condition Rule" ? { ...r, description: "정규식 분기 금지" } : r
  )
  const after = await buildRulesSnapshot(edited as any[], groupRulesByStage(edited as any[]), "", "gpt-4o")
  assertNotEquals(before.hash, after.hash)
  assertNotEquals(before.stage_hashes.condition, after.stage_hashes.condition)
  assertEquals(before.stage_hashes.flow, after.stage_hashes.flow)
  assertEquals(before.stage_hashes.output, after.stage_hashes.output)
})

Deno.test("buildRulesSnapshot: Variable Usage Rule 수정 → 4개 스테이지 해시 전부 변경(blast radius)", async () => {
  const before = await buildRulesSnapshot(ROWS as any[], groupRulesByStage(ROWS as any[]), "", "gpt-4o")
  const edited = ROWS.map((r) =>
    r.category === "Variable Usage Rule" ? { ...r, description: "영문 스네이크케이스만" } : r
  )
  const after = await buildRulesSnapshot(edited as any[], groupRulesByStage(edited as any[]), "", "gpt-4o")
  for (const stage of ["flow", "config", "output", "condition"] as const) {
    assertNotEquals(before.stage_hashes[stage], after.stage_hashes[stage], stage)
  }
})

Deno.test("buildRulesSnapshot: count_by_category·model·examples_hash", async () => {
  const snap = await buildRulesSnapshot(ROWS as any[], groupRulesByStage(ROWS as any[]), "예시 텍스트", "gpt-4o")
  assertEquals(snap.count_by_category, { "Solution Rule": 1, "Condition Rule": 1, "Variable Usage Rule": 1 })
  assertEquals(snap.model, "gpt-4o")
  assertEquals(snap.examples_hash, await sha256Hex("예시 텍스트"))
})

Deno.test("buildScenarioExamplesMeta: 주입됨", () => {
  const m = buildScenarioExamplesMeta({
    category: "금융", candidates: 5, pickedNames: ["이체봇", "잔액조회봇"], examplesText: "예시…",
  })
  assertEquals(m, {
    category: "금융", candidates: 5, picked: ["이체봇", "잔액조회봇"],
    injected: true, examples_chars: 3, skipped_reason: "",
  })
})

Deno.test("buildRulesSnapshot: description 없이 content.text만 있는 행의 content 수정 → hash 변경", async () => {
  const rowsBefore = [
    { category: "Output Message Rule", title: "인사문구", content: { text: "환영합니다" }, order_index: 1 },
  ]
  const rowsAfter = [
    { category: "Output Message Rule", title: "인사문구", content: { text: "반갑습니다" }, order_index: 1 },
  ]
  const before = await buildRulesSnapshot(
    rowsBefore as any[],
    groupRulesByStage(rowsBefore as any[]),
    "",
    "gpt-4o",
  )
  const after = await buildRulesSnapshot(
    rowsAfter as any[],
    groupRulesByStage(rowsAfter as any[]),
    "",
    "gpt-4o",
  )
  assertNotEquals(before.hash, after.hash)
})

Deno.test("buildScenarioExamplesMeta: skip 사유 기록, injected=false", () => {
  const m = buildScenarioExamplesMeta({
    category: "", candidates: 0, pickedNames: [], examplesText: "", skippedReason: "no-category",
  })
  assertEquals(m.injected, false)
  assertEquals(m.examples_chars, 0)
  assertEquals(m.skipped_reason, "no-category")
})

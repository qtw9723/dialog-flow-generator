import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { emptyUsage, accumulateUsage, estimateCostUsd, serializeUsage, PRICING_BY_MODEL } from "./usage.ts"

Deno.test("accumulateUsage: 여러 호출의 토큰을 누적하고 calls를 증가", () => {
  const acc = emptyUsage()
  accumulateUsage(acc, { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 })
  accumulateUsage(acc, { prompt_tokens: 200, completion_tokens: 60, total_tokens: 260 })
  assertEquals(acc.calls, 2)
  assertEquals(acc.prompt_tokens, 300)
  assertEquals(acc.completion_tokens, 100)
  assertEquals(acc.total_tokens, 400)
})

Deno.test("accumulateUsage: usage 없어도 calls는 증가, 토큰은 0 가산", () => {
  const acc = emptyUsage()
  accumulateUsage(acc, undefined)
  accumulateUsage(acc, null)
  assertEquals(acc.calls, 2)
  assertEquals(acc.total_tokens, 0)
})

Deno.test("accumulateUsage: total_tokens 없으면 prompt+completion으로 보정", () => {
  const acc = emptyUsage()
  accumulateUsage(acc, { prompt_tokens: 50, completion_tokens: 30 })
  assertEquals(acc.total_tokens, 80)
})

Deno.test("estimateCostUsd: gpt-4o 단가로 입력/출력 분리 계산", () => {
  // 1,000,000 입력 → $2.5, 1,000,000 출력 → $10 → 합 $12.5
  const u = { calls: 1, prompt_tokens: 1_000_000, completion_tokens: 1_000_000, total_tokens: 2_000_000 }
  assertEquals(estimateCostUsd(u, "gpt-4o"), 12.5)
})

Deno.test("estimateCostUsd: 소수 4자리 반올림", () => {
  const u = { calls: 1, prompt_tokens: 9800, completion_tokens: 2545, total_tokens: 12345 }
  // 9800/1e6*2.5 + 2545/1e6*10 = 0.0245 + 0.02545 = 0.04995
  assertEquals(estimateCostUsd(u, "gpt-4o"), 0.05)
  assertEquals(PRICING_BY_MODEL["gpt-4o"].inputPer1M, 2.5)
})

Deno.test("estimateCostUsd: 단가를 모르는 모델은 null을 반환한다(틀린 숫자 금지)", () => {
  const u = { calls: 1, prompt_tokens: 1_000_000, completion_tokens: 1_000_000, total_tokens: 2_000_000 }
  assertEquals(estimateCostUsd(u, "gpt-5.2"), null)
})

Deno.test("serializeUsage: 비용 미상이면 estimated_cost_usd가 null로 저장된다", () => {
  const u = { calls: 1, prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }
  const s = serializeUsage(u, "gpt-5.2")
  assertEquals(s.estimated_cost_usd, null)
  assertEquals(s.model, "gpt-5.2")
})

Deno.test("serializeUsage: 모델·비용 포함 직렬화", () => {
  const u = { calls: 6, prompt_tokens: 9800, completion_tokens: 2545, total_tokens: 12345 }
  const s = serializeUsage(u, "gpt-4o")
  assertEquals(s.model, "gpt-4o")
  assertEquals(s.calls, 6)
  assertEquals(s.total_tokens, 12345)
  assertEquals(s.estimated_cost_usd, 0.05)
})

// ─── 생성 소요 시간(duration_ms) ───
// 3번째 인자는 선택적 — 기존 호출부·기존 결과의 형태를 깨지 않는다(없으면 키 자체를 안 만든다).

Deno.test("serializeUsage: durationMs를 주면 duration_ms로 실린다", () => {
  const u = { calls: 3, prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
  const out = serializeUsage(u as any, "gpt-5.2", 72000)
  assertEquals((out as any).duration_ms, 72000)
})

Deno.test("serializeUsage: durationMs 없으면 키를 만들지 않는다", () => {
  const u = { calls: 3, prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
  const out = serializeUsage(u as any, "gpt-5.2")
  assertEquals("duration_ms" in (out as any), false)
})

Deno.test("serializeUsage: 유효하지 않은 durationMs는 무시한다", () => {
  const u = { calls: 1, prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  for (const bad of [-1, NaN, undefined, null]) {
    const out = serializeUsage(u as any, "gpt-5.2", bad as any)
    assertEquals("duration_ms" in (out as any), false)
  }
})

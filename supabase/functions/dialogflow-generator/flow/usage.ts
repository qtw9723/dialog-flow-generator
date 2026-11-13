// LLM 토큰 사용량 집계 + 비용 추정.
// 모든 LLM 호출이 단일 callLlm 어댑터를 거치므로, 거기서 OpenAI 응답의 usage를 누적한다.

export interface TokenUsage {
  calls: number              // OpenAI 요청 횟수(모든 스테이지 합)
  prompt_tokens: number      // 입력 토큰 합
  completion_tokens: number  // 출력 토큰 합
  total_tokens: number       // 총 토큰 합
}

export function emptyUsage(): TokenUsage {
  return { calls: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
}

// OpenAI 응답의 usage 객체(raw)를 누적기에 더한다(in-place). usage가 없어도 calls는 증가.
export function accumulateUsage(acc: TokenUsage, raw: unknown): void {
  acc.calls += 1
  const u = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {}
  const p = Number(u.prompt_tokens) || 0
  const c = Number(u.completion_tokens) || 0
  const t = Number(u.total_tokens) || p + c
  acc.prompt_tokens += p
  acc.completion_tokens += c
  acc.total_tokens += t
}

// 모델별 단가 (USD per 1M tokens). 아는 모델만 적는다.
// ⚠ 모르는 모델은 여기 넣지 말 것 — 추정치를 적으면 화면에 "틀린 숫자"가 뜬다.
//    2026-07-09~2026-09-28 동안 gpt-5.2로 돌면서 gpt-4o 단가를 표시해 왔다.
export const PRICING_BY_MODEL: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
}

/**
 * 입력/출력 토큰 × 단가로 예상 비용(USD)을 계산. 소수 4자리로 반올림.
 * 단가를 모르는 모델은 null — 비용 미상을 틀린 숫자로 채우지 않는다.
 */
export function estimateCostUsd(u: TokenUsage, model: string): number | null {
  const pricing = PRICING_BY_MODEL[model]
  if (!pricing) return null
  const cost =
    (u.prompt_tokens / 1_000_000) * pricing.inputPer1M +
    (u.completion_tokens / 1_000_000) * pricing.outputPer1M
  return Math.round(cost * 10000) / 10000
}

// generation_tiers.usage 에 저장할 직렬화 형태(모델·비용 포함).
/**
 * 사용량 번들 직렬화.
 * @param durationMs 생성 소요 시간(선택) — 엣지함수 핸들러 진입부터 결과 저장 직전까지의 서버 시간.
 *   클라이언트 왕복·네트워크는 포함하지 않는다. 유효하지 않으면 키를 만들지 않는다
 *   (기존 결과에는 이 키가 없으므로, 0을 넣으면 측정한 적 없는 것을 측정한 것처럼 만든다).
 */
export function serializeUsage(u: TokenUsage, model: string, durationMs?: number): {
  model: string
  calls: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number | null
  duration_ms?: number
} {
  const hasDuration = typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0
  return {
    model,
    calls: u.calls,
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    total_tokens: u.total_tokens,
    estimated_cost_usd: estimateCostUsd(u, model),
    ...(hasDuration ? { duration_ms: durationMs } : {}),
  }
}

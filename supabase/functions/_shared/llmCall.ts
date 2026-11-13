// OpenAI chat 호출 + 실패 검사 (공유 모듈).
//
// ⚠ 왜 공유인가: resp.ok를 안 보는 함수가 5개였고(2026-09-28 실측), 그중 셋은
//    실패를 "문서에 내용이 없음"과 똑같은 빈 결과로 흡수했다. 각 함수가 자기 검사를
//    따로 들고 있으면 또 한 곳만 고쳐진다 — 이 저장소가 반복해 다친 모양이다.
// ⚠ finish_reason은 저장소 전체에서 한 번도 확인된 적이 없다. 긴 문서로 출력이 잘리면
//    JSON 파싱이 실패하고, 그 실패가 다시 빈 결과로 흡수됐다.
// ⚠ 일시 오류(429·5xx·네트워크)는 여기서 짧게 재시도한다(2026-10-14). 결과 1713d3d0에서
//    ESD 타입 추론 한 번이 503을 맞아 그 스키마 전 필드가 string 폴백으로 떨어졌는데,
//    생성은 성공으로 끝나 경고만 남았다. 호출부마다 재시도를 두면 또 한 곳만 고쳐지고,
//    호출부가 이 위에 재시도를 또 감싸면 횟수가 곱해진다.
import { llmErrorMessage } from './llmError.ts'
import { LLM_MODEL } from './llmModel.ts'

export const TRUNCATED_MESSAGE =
  '문서가 너무 길어 응답이 잘렸습니다. 시나리오 단위로 나눠 올려주세요.'

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

/** 기본 재시도 횟수(첫 시도 제외). 생성기는 호출이 많아 엣지 함수 시간 한도를 넘지 않게 짧게 둔다. */
export const DEFAULT_RETRIES = 2
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 8000
const JITTER_MS = 250

/**
 * 다시 불러서 나아질 수 있는 HTTP 오류인가.
 * 429 중 insufficient_quota(잔액 부족)는 기다려도 풀리지 않으므로 제외한다.
 */
export function isRetryable(status: number, bodyText: string): boolean {
  if (status === 429) return !bodyText.includes('insufficient_quota')
  return status >= 500 && status <= 599
}

/**
 * attempt번째 재시도 전 대기 시간(ms). Retry-After(초)가 있으면 따르고, 없으면 1s·2s·4s…+지터.
 * 어느 쪽이든 MAX_DELAY_MS로 자른다 — 서버가 큰 값을 줘도 생성 전체가 멈추지 않게.
 */
export function retryDelayMs(attempt: number, retryAfter: string | null, random = Math.random): number {
  const sec = retryAfter === null ? NaN : Number(retryAfter)
  const ms = Number.isFinite(sec) && sec >= 0
    ? sec * 1000
    : BASE_DELAY_MS * 2 ** attempt + Math.floor(random() * JITTER_MS)
  return Math.min(ms, MAX_DELAY_MS)
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface ChatOptions {
  apiKey: string
  prompt: string
  model?: string
  temperature?: number
  maxCompletionTokens?: number
  /** 일시 오류 재시도 횟수(첫 시도 제외). 기본 DEFAULT_RETRIES. */
  retries?: number
  /** 응답 usage를 받는다(토큰 집계용). 오류 응답에는 usage가 없어 불리지 않는다. */
  onUsage?: (usage: unknown) => void
  /** 테스트 주입용. 실제 호출에서는 넘기지 않는다. */
  fetchImpl?: typeof fetch
  /** 테스트 주입용(재시도 대기). */
  sleep?: (ms: number) => Promise<void>
}

/**
 * OpenAI chat completion을 호출하고 응답 content를 돌려준다.
 * 일시 오류(429·5xx·연결 실패)는 짧은 백오프로 재시도하고, 끝내 안 되면 마지막 오류를 던진다.
 * 영구 HTTP 오류와 잘린 응답은 바로 **던진다** — 호출부가 삼킬지 말지는 호출부가 정한다.
 */
export async function callOpenAiChat(opts: ChatOptions): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch
  const retries = opts.retries ?? DEFAULT_RETRIES
  const sleep = opts.sleep ?? defaultSleep
  const body: Record<string, unknown> = {
    model: opts.model ?? LLM_MODEL,
    messages: [{ role: 'user', content: opts.prompt }],
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxCompletionTokens !== undefined) body.max_completion_tokens = opts.maxCompletionTokens
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify(body),
  }

  for (let attempt = 0; ; attempt++) {
    let resp: Response
    try {
      resp = await doFetch(ENDPOINT, init)
    } catch (err) {
      // fetch 자체가 던지면 응답을 못 받은 것(연결 문제) — 일시 오류로 본다.
      if (attempt >= retries) throw err
      const wait = retryDelayMs(attempt, null)
      console.warn(`[llmCall] 연결 실패, ${wait}ms 후 재시도 (${attempt + 1}/${retries}):`, (err as Error).message)
      await sleep(wait)
      continue
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      const message = llmErrorMessage(resp.status, text)
      if (attempt >= retries || !isRetryable(resp.status, text)) throw new Error(message)
      const wait = retryDelayMs(attempt, resp.headers.get('retry-after'))
      console.warn(`[llmCall] ${wait}ms 후 재시도 (${attempt + 1}/${retries}):`, message)
      await sleep(wait)
      continue
    }

    const data = await resp.json()
    // 잘린 응답도 토큰은 썼다 — 던지기 전에 넘겨야 사용량이 낮게 집계되지 않는다.
    opts.onUsage?.(data?.usage)
    const choice = data?.choices?.[0]
    if (choice?.finish_reason === 'length') throw new Error(TRUNCATED_MESSAGE)
    return choice?.message?.content ?? ''
  }
}

import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { callOpenAiChat, isRetryable, retryDelayMs, TRUNCATED_MESSAGE } from './llmCall.ts'

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    )) as unknown as typeof fetch
}

const noSleep = () => Promise.resolve()

const OK_BODY = { choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }] }

Deno.test('정상 응답이면 content를 돌려준다', async () => {
  const out = await callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: fakeFetch(200, OK_BODY) })
  assertEquals(out, '{"a":1}')
})

Deno.test('HTTP 오류면 상태와 본문을 담아 던진다', async () => {
  const err = await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: fakeFetch(429, '{"error":{"message":"rate limit"}}'), sleep: noSleep })
  )
  const msg = (err as Error).message
  assertEquals(msg.includes('429'), true, msg)
  assertEquals(msg.includes('rate limit'), true, msg)
})

Deno.test('오류 본문의 API 키 모양은 마스킹된다', async () => {
  const err = await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: fakeFetch(401, 'bad key sk-ABCDEFGH12345678') })
  )
  const msg = (err as Error).message
  assertEquals(msg.includes('sk-ABCDEFGH12345678'), false, msg)
  assertEquals(msg.includes('sk-***'), true, msg)
})

Deno.test('finish_reason이 length면 잘림으로 던진다', async () => {
  const truncated = { choices: [{ message: { content: '{"a":' }, finish_reason: 'length' }] }
  const err = await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: fakeFetch(200, truncated) })
  )
  assertEquals((err as Error).message, TRUNCATED_MESSAGE)
})

Deno.test('content가 없으면 빈 문자열 — 던지지 않는다(기존 의미 유지)', async () => {
  const empty = { choices: [{ message: {}, finish_reason: 'stop' }] }
  const out = await callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: fakeFetch(200, empty) })
  assertEquals(out, '')
})

Deno.test('temperature와 model이 요청 본문에 실린다', async () => {
  let sentBody = ''
  const spy = ((_url: string, init: RequestInit) => {
    sentBody = String(init.body)
    return Promise.resolve(new Response(JSON.stringify(OK_BODY), { status: 200 }))
  }) as unknown as typeof fetch
  await callOpenAiChat({ apiKey: 'k', prompt: 'p', model: 'test-model', temperature: 0.1, fetchImpl: spy })
  const parsed = JSON.parse(sentBody)
  assertEquals(parsed.model, 'test-model')
  assertEquals(parsed.temperature, 0.1)
  assertEquals(parsed.messages, [{ role: 'user', content: 'p' }])
})

// ── 일시 오류 재시도 (2026-10-14) ─────────────────────────────────────────
// ⚠ 왜: 결과 1713d3d0에서 ESD 타입 추론 6회 중 1회가 503을 맞아 그 스키마 전 필드가
//    string 폴백으로 떨어졌다. 생성은 성공으로 끝나 사용자는 경고를 놓치기 쉽다.

/** 응답을 차례로 돌려주는 fetch. 마지막 응답은 반복된다. 호출 횟수를 센다. */
function seqFetch(responses: Array<[number, unknown, Record<string, string>?] | Error>) {
  let calls = 0
  const impl = (() => {
    const r = responses[Math.min(calls, responses.length - 1)]
    calls++
    if (r instanceof Error) return Promise.reject(r)
    const [status, body, headers] = r
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
    )
  }) as unknown as typeof fetch
  return { impl, calls: () => calls }
}

Deno.test('503 뒤 성공하면 재시도해서 content를 돌려준다', async () => {
  const f = seqFetch([[503, 'Unable to verify model access'], [200, OK_BODY]])
  const out = await callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep })
  assertEquals(out, '{"a":1}')
  assertEquals(f.calls(), 2)
})

Deno.test('429(rate limit)도 재시도한다', async () => {
  const f = seqFetch([[429, '{"error":{"code":"rate_limit_exceeded"}}'], [200, OK_BODY]])
  await callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep })
  assertEquals(f.calls(), 2)
})

Deno.test('네트워크 오류(fetch 예외)도 재시도한다', async () => {
  const f = seqFetch([new TypeError('connection reset'), [200, OK_BODY]])
  const out = await callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep })
  assertEquals(out, '{"a":1}')
  assertEquals(f.calls(), 2)
})

Deno.test('계속 5xx면 기본 2회 재시도(총 3회) 후 마지막 오류를 던진다', async () => {
  const f = seqFetch([[500, 'boom']])
  const err = await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep })
  )
  assertEquals(f.calls(), 3)
  assertEquals((err as Error).message.includes('HTTP 500'), true)
})

Deno.test('계속 네트워크 오류면 3회 후 원래 예외를 던진다', async () => {
  const f = seqFetch([new TypeError('connection reset')])
  const err = await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep })
  )
  assertEquals(f.calls(), 3)
  assertEquals((err as Error).message, 'connection reset')
})

Deno.test('retries: 0이면 재시도하지 않는다', async () => {
  const f = seqFetch([[503, 'x'], [200, OK_BODY]])
  await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep, retries: 0 })
  )
  assertEquals(f.calls(), 1)
})

for (const [status, body] of [
  [401, 'bad key'],
  [400, '{"error":{"message":"invalid"}}'],
  [404, 'model not found'],
  [429, '{"error":{"code":"insufficient_quota","type":"insufficient_quota"}}'],
] as const) {
  Deno.test(`영구 오류(${status} ${body.slice(0, 30)})는 재시도하지 않는다`, async () => {
    const f = seqFetch([[status, body], [200, OK_BODY]])
    await assertRejects(() =>
      callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep })
    )
    assertEquals(f.calls(), 1)
  })
}

Deno.test('잘린 응답은 재시도하지 않는다 — 다시 불러도 같은 결과(비용만 늘어남)', async () => {
  const truncated = { choices: [{ message: { content: '{' }, finish_reason: 'length' }] }
  const f = seqFetch([[200, truncated], [200, OK_BODY]])
  await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep })
  )
  assertEquals(f.calls(), 1)
})

Deno.test('재시도 사이 대기는 Retry-After를 따르되 상한(8s)을 둔다', async () => {
  const waits: number[] = []
  const f = seqFetch([[503, 'x', { 'retry-after': '3' }], [503, 'x', { 'retry-after': '999' }], [200, OK_BODY]])
  await callOpenAiChat({
    apiKey: 'k', prompt: 'p', fetchImpl: f.impl,
    sleep: (ms) => { waits.push(ms); return Promise.resolve() },
  })
  assertEquals(waits, [3000, 8000])
})

Deno.test('retryDelayMs — Retry-After 없으면 1s·2s 기준 + 지터(최대 250ms)', () => {
  assertEquals(retryDelayMs(0, null, () => 0), 1000)
  const b = retryDelayMs(1, null, () => 0.999)
  assertEquals(b >= 2000 && b < 2250, true, String(b))
  assertEquals(retryDelayMs(5, null, () => 0), 8000)
})

Deno.test('isRetryable — 429·5xx만, insufficient_quota 제외', () => {
  assertEquals(isRetryable(429, ''), true)
  assertEquals(isRetryable(502, ''), true)
  assertEquals(isRetryable(503, ''), true)
  assertEquals(isRetryable(429, '{"error":{"code":"insufficient_quota"}}'), false)
  assertEquals(isRetryable(401, ''), false)
  assertEquals(isRetryable(404, ''), false)
})

Deno.test('onUsage — 성공한 응답의 usage만 넘긴다(실패한 시도는 usage가 없다)', async () => {
  const seen: unknown[] = []
  const withUsage = { ...OK_BODY, usage: { prompt_tokens: 10, completion_tokens: 2 } }
  const f = seqFetch([[503, 'x'], [200, withUsage]])
  await callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: f.impl, sleep: noSleep, onUsage: (u) => seen.push(u) })
  assertEquals(seen, [{ prompt_tokens: 10, completion_tokens: 2 }])
})

Deno.test('onUsage — 잘린 응답도 토큰은 썼으므로 던지기 전에 usage를 넘긴다', async () => {
  const seen: unknown[] = []
  const truncated = { choices: [{ message: { content: '{' }, finish_reason: 'length' }], usage: { completion_tokens: 99 } }
  await assertRejects(() =>
    callOpenAiChat({ apiKey: 'k', prompt: 'p', fetchImpl: seqFetch([[200, truncated]]).impl, onUsage: (u) => seen.push(u) })
  )
  assertEquals(seen, [{ completion_tokens: 99 }])
})

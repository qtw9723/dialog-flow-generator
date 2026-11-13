import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { llmErrorMessage, maskApiKeys, BODY_LIMIT } from './llmError.ts'

Deno.test('상태 코드가 메시지에 들어간다', () => {
  const m = llmErrorMessage(429, '{"error":{"message":"Rate limit reached"}}')
  assertEquals(m.includes('429'), true)
  assertEquals(m.includes('Rate limit reached'), true)
})

Deno.test('본문은 앞 300자까지만 담는다', () => {
  const long = 'x'.repeat(1000)
  const m = llmErrorMessage(500, long)
  assertEquals(m.includes('x'.repeat(BODY_LIMIT)), true)
  assertEquals(m.includes('x'.repeat(BODY_LIMIT + 1)), false)
  assertEquals(m.includes('…'), true)
})

Deno.test('300자 이하이면 자르지 않고 말줄임도 안 붙인다', () => {
  const m = llmErrorMessage(400, 'short body')
  assertEquals(m.includes('short body'), true)
  assertEquals(m.includes('…'), false)
})

Deno.test('sk- 토큰 모양은 마스킹한다', () => {
  const m = llmErrorMessage(401, 'bad key sk-abcdef1234567890abcdef1234567890 rejected')
  assertEquals(m.includes('sk-abcdef1234567890abcdef1234567890'), false)
  assertEquals(m.includes('sk-***'), true)
  assertEquals(m.includes('rejected'), true)
})

Deno.test('마스킹은 자르기보다 먼저 적용된다 — 잘린 조각으로도 키가 새면 안 된다', () => {
  const key = 'sk-' + 'b'.repeat(48)
  const m = llmErrorMessage(401, 'x'.repeat(BODY_LIMIT - 10) + key)
  assertEquals(m.includes('sk-bbbb'), false)
})

Deno.test('빈 본문·공백 본문에도 던지지 않고 상태만 남긴다', () => {
  assertEquals(llmErrorMessage(502, '').includes('502'), true)
  assertEquals(llmErrorMessage(502, '   ').includes('502'), true)
})

Deno.test('본문이 없을 때 빈 따옴표 껍데기를 남기지 않는다', () => {
  const m = llmErrorMessage(502, '')
  assertEquals(m.trim().endsWith(':'), false)
})

Deno.test('maskApiKeys: sk- 토큰을 가린다', () => {
  assertEquals(maskApiKeys('bad key sk-abcdef1234567890 here'), 'bad key sk-*** here')
})

Deno.test('maskApiKeys: 토큰이 여럿이면 전부 가린다', () => {
  const m = maskApiKeys('sk-aaaaaaaaaa and sk-bbbbbbbbbb')
  assertEquals(m, 'sk-*** and sk-***')
})

Deno.test('maskApiKeys: 토큰이 없으면 원문 그대로', () => {
  assertEquals(maskApiKeys('그냥 오류 메시지'), '그냥 오류 메시지')
})

Deno.test('maskApiKeys: null·undefined·숫자에도 던지지 않는다', () => {
  assertEquals(maskApiKeys(null), '')
  assertEquals(maskApiKeys(undefined), '')
  assertEquals(maskApiKeys(123), '123')
})

Deno.test('llmErrorMessage가 maskApiKeys를 거친다 — 마스킹 규칙이 한 곳이다', () => {
  const raw = 'key sk-cccccccccc rejected'
  assertEquals(llmErrorMessage(401, raw).includes(maskApiKeys(raw)), true)
})

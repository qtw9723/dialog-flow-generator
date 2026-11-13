import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { lengthWarning, LENGTH_WARN_THRESHOLD } from './lengthWarning.ts'

Deno.test('짧은 문서는 경고 없음', () => {
  assertEquals(lengthWarning('짧은 문서'), null)
})

Deno.test('임계값 이하는 경고 없음', () => {
  assertEquals(lengthWarning('가'.repeat(LENGTH_WARN_THRESHOLD)), null)
})

Deno.test('임계값 초과는 경고한다', () => {
  const msg = lengthWarning('가'.repeat(LENGTH_WARN_THRESHOLD + 1))
  assertEquals(typeof msg, 'string')
  assertEquals(msg.includes('나눠'), true, msg)
})

Deno.test('경고에 실제 글자 수가 들어간다', () => {
  const n = LENGTH_WARN_THRESHOLD + 500
  const msg = lengthWarning('가'.repeat(n))
  assertEquals(msg.includes(n.toLocaleString('ko-KR')), true, msg)
})

Deno.test('빈 입력·null도 던지지 않는다', () => {
  assertEquals(lengthWarning(''), null)
  assertEquals(lengthWarning(null), null)
})

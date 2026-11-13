import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { rawErrorMessage } from './errorMessage.js'

Deno.test('rawErrorMessage: Error 객체는 message를 뽑는다', () => {
  assertEquals(rawErrorMessage(new Error('boom')), 'boom')
})

Deno.test('rawErrorMessage: 문자열은 그대로', () => {
  assertEquals(rawErrorMessage('그냥 문자열'), '그냥 문자열')
})

Deno.test('rawErrorMessage: null은 null', () => {
  assertEquals(rawErrorMessage(null), null)
})

Deno.test('rawErrorMessage: undefined는 null', () => {
  assertEquals(rawErrorMessage(undefined), null)
})

Deno.test('rawErrorMessage: 숫자는 null', () => {
  assertEquals(rawErrorMessage(123), null)
})

Deno.test('rawErrorMessage: message 없는 객체는 null', () => {
  assertEquals(rawErrorMessage({}), null)
})

Deno.test('rawErrorMessage: message가 문자열이 아니면 null', () => {
  assertEquals(rawErrorMessage({ message: 123 }), null)
})

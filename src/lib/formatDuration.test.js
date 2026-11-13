import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { formatDuration } from "./formatDuration.js"

// 생성 소요 시간 표시용. 값이 없으면 호출부가 줄 자체를 렌더하지 않으므로
// null/undefined는 null을 돌려준다("0초"를 보여주면 거짓말이 된다).

Deno.test("1분 미만은 초 단위(소수 1자리, 불필요한 0 제거)", () => {
  assertEquals(formatDuration(1200), '1.2초')
  assertEquals(formatDuration(9500), '9.5초')
  assertEquals(formatDuration(3000), '3초')
  assertEquals(formatDuration(59900), '59.9초')
})

Deno.test("1분 이상은 분+초(초는 반올림 정수)", () => {
  assertEquals(formatDuration(60000), '1분')
  assertEquals(formatDuration(72000), '1분 12초')
  assertEquals(formatDuration(185000), '3분 5초')
  assertEquals(formatDuration(3600000), '60분')
})

Deno.test("1초 미만도 초로 표기", () => {
  assertEquals(formatDuration(400), '0.4초')
  assertEquals(formatDuration(50), '0.1초')
})

Deno.test("값이 없으면 null — 호출부가 줄을 숨긴다", () => {
  assertEquals(formatDuration(null), null)
  assertEquals(formatDuration(undefined), null)
  assertEquals(formatDuration(''), null)
})

Deno.test("음수·NaN·숫자 아님은 null (잘못된 값으로 거짓 표시 금지)", () => {
  assertEquals(formatDuration(-5), null)
  assertEquals(formatDuration(NaN), null)
  assertEquals(formatDuration('abc'), null)
  assertEquals(formatDuration({}), null)
})

Deno.test("0은 유효한 값 — 0초", () => {
  assertEquals(formatDuration(0), '0초')
})

Deno.test("숫자 문자열도 받는다(jsonb 왕복 대비)", () => {
  assertEquals(formatDuration('72000'), '1분 12초')
})

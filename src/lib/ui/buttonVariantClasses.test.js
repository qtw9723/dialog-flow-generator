import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { BUTTON_VARIANTS, BUTTON_SIZES } from '../../components/common/buttonVariantClasses.js'

Deno.test('outlinePrimary는 브랜드색 테두리·글자를 쓴다 — 기존 BTN_OUTLINE의 모양을 보존한다', () => {
  const cls = BUTTON_VARIANTS.outlinePrimary
  assertEquals(cls.includes('border-primary-500'), true)
  assertEquals(cls.includes('text-primary-500'), true)
})

Deno.test('outline(회색)과 outlinePrimary(파랑)는 서로 다르다', () => {
  assertEquals(BUTTON_VARIANTS.outline === BUTTON_VARIANTS.outlinePrimary, false)
})

Deno.test('기존 variant·size 이름이 모두 보존된다 — 호출부가 깨지면 안 된다', () => {
  for (const k of ['default', 'secondary', 'outline', 'ghost', 'danger']) {
    assertEquals(typeof BUTTON_VARIANTS[k], 'string', `variant ${k} 누락`)
  }
  for (const k of ['default', 'sm', 'lg', 'icon']) {
    assertEquals(typeof BUTTON_SIZES[k], 'string', `size ${k} 누락`)
  }
})

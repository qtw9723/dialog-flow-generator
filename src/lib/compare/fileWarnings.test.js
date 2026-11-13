import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { fileWarnings, SIZE_WARN_BYTES } from './fileWarnings.js'

Deno.test('작은 파일 + 행이 있으면 경고 없음', () => {
  assertEquals(fileWarnings({ size: 100, rowCount: 5 }), [])
})

Deno.test('정확히 임계값이면 경고 없음(경계는 >)', () => {
  assertEquals(fileWarnings({ size: SIZE_WARN_BYTES, rowCount: 1 }), [])
})

Deno.test('임계값보다 1바이트 크면 크기 경고', () => {
  const out = fileWarnings({ size: SIZE_WARN_BYTES + 1, rowCount: 1 })
  assertEquals(out.length, 1)
  assertEquals(out[0].startsWith('파일이 큽니다'), true)
})

Deno.test('크기 경고 문구에 MB 수치가 소수 1자리로 들어간다', () => {
  const size = 12.34 * 1024 * 1024
  const out = fileWarnings({ size, rowCount: 1 })
  assertEquals(out[0], '파일이 큽니다(12.3MB) — 비교는 되지만 표시는 일부만 됩니다.')
})

Deno.test('행이 0이면 데이터 행 없음 경고', () => {
  assertEquals(fileWarnings({ size: 100, rowCount: 0 }), ['데이터 행이 없습니다(헤더만 있는 파일).'])
})

Deno.test('둘 다 해당하면 경고 2건, 크기 경고가 먼저', () => {
  const out = fileWarnings({ size: SIZE_WARN_BYTES + 1, rowCount: 0 })
  assertEquals(out.length, 2)
  assertEquals(out[0].startsWith('파일이 큽니다'), true)
  assertEquals(out[1], '데이터 행이 없습니다(헤더만 있는 파일).')
})

Deno.test('인자 없이 불러도 던지지 않는다', () => {
  assertEquals(fileWarnings(), ['데이터 행이 없습니다(헤더만 있는 파일).'])
})

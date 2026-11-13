import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { summarizeIngestFailures } from './summarizeIngestFailures.js'

Deno.test('실패가 없으면 null', () => {
  assertEquals(summarizeIngestFailures([], 3), null)
})

Deno.test('실패 개수와 전체 개수를 함께 말한다', () => {
  const msg = summarizeIngestFailures([{ name: 'a.pdf', reason: '텍스트 레이어 없음' }], 3)
  assertEquals(msg.includes('3개 중 1개'), true, msg)
})

Deno.test('파일명과 사유를 나열한다', () => {
  const msg = summarizeIngestFailures(
    [{ name: 'a.pdf', reason: '텍스트 없음' }, { name: 'b.hwp', reason: '미지원 형식' }],
    4,
  )
  assertEquals(msg.includes('a.pdf'), true, msg)
  assertEquals(msg.includes('텍스트 없음'), true, msg)
  assertEquals(msg.includes('b.hwp'), true, msg)
  assertEquals(msg.includes('미지원 형식'), true, msg)
})

Deno.test('사유가 비어도 파일명은 남는다', () => {
  const msg = summarizeIngestFailures([{ name: 'c.xlsx', reason: '' }], 2)
  assertEquals(msg.includes('c.xlsx'), true, msg)
})

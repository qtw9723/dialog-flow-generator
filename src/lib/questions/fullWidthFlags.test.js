import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { fullWidthFlags } from './fullWidthFlags.js'

const wide = (x) => x === 'W'
const flags = (s) => fullWidthFlags(s.split(''), wide)

Deno.test('fullWidthFlags — 넓은 칸은 항상 전체, 짝 있는 좁은 칸은 반씩', () => {
  assertEquals(flags('NN'), [false, false])
  assertEquals(flags('WNN'), [true, false, false])
})

Deno.test('fullWidthFlags — 다음이 넓은 칸이거나 마지막이면 좁은 칸도 전체(오른쪽 빈자리 방지)', () => {
  assertEquals(flags('NWNN'), [true, true, false, false]) // 설문 기본 정보: 이름·목적·산업군·말투
  assertEquals(flags('NNN'), [false, false, true])
  assertEquals(flags('N'), [true])
  assertEquals(flags('NNNW'), [false, false, true, true])
})

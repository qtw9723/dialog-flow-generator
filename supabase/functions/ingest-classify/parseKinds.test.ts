import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { parseKinds } from './parseKinds.ts'

Deno.test('정상 배열은 그대로 돌려준다', () => {
  assertEquals(parseKinds('["esd","api","scenario"]', 3), ['esd', 'api', 'scenario'])
})

Deno.test('JSON이 아니면 scenario가 아니라 ambiguous로 채운다', () => {
  // ⚠ 예전엔 scenario로 채웠다. ESD·API 파일이 조용히 시나리오 파서로 흘러갔다.
  assertEquals(parseKinds('설명만 있고 배열이 없음', 2), ['ambiguous', 'ambiguous'])
})

Deno.test('길이가 다르면 ambiguous로 채운다', () => {
  assertEquals(parseKinds('["esd"]', 3), ['ambiguous', 'ambiguous', 'ambiguous'])
})

Deno.test('모르는 kind 하나는 그 자리만 ambiguous가 된다', () => {
  assertEquals(parseKinds('["esd","무엇","api"]', 3), ['esd', 'ambiguous', 'api'])
})

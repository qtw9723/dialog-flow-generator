import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { groupSteps } from './groupSteps.js'

const q = (id, input_type) => ({ id, input_type, text: `질문 ${id}` })

Deno.test('groupSteps — 시나리오(templated) 앞은 기본 정보, 뒤는 추가 설정으로 묶는다', () => {
  const steps = groupSteps([q('a', 'text'), q('b', 'select'), q('s', 'templated'), q('c', 'textarea'), q('d', 'select')])
  assertEquals(steps.map((s) => [s.key, s.title, s.questions.map((x) => x.id)]), [
    ['basic', '기본 정보', ['a', 'b']],
    ['templated-s', '질문 s', ['s']],
    ['extra', '추가 설정', ['c', 'd']],
  ])
})

Deno.test('groupSteps — templated가 여러 개면 각각 한 단계, 사이 질문은 추가 설정으로 이어 묶는다', () => {
  const steps = groupSteps([q('s1', 'templated'), q('x', 'text'), q('s2', 'templated'), q('y', 'text')])
  assertEquals(steps.map((s) => [s.key, s.questions.map((x) => x.id)]), [
    ['templated-s1', ['s1']],
    ['extra', ['x']],
    ['templated-s2', ['s2']],
    ['extra-2', ['y']],
  ])
})

Deno.test('groupSteps — templated가 없으면 한 단계(기본 정보), 빈 입력은 빈 배열', () => {
  assertEquals(groupSteps([q('a', 'text'), q('b', 'text')]).map((s) => s.key), ['basic'])
  assertEquals(groupSteps([]), [])
  assertEquals(groupSteps(null), [])
})

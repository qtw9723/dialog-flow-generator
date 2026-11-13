import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { groupIntentDiff } from './groupDiff.js'
import { KEY_SEP } from './diffRows.js'

const entry = (intent, example) => ({ key: `${intent}${KEY_SEP}${example}`, row: [intent, example] })

Deno.test('인텐트별로 추가·삭제를 모은다', () => {
  const diff = {
    added: [entry('매장예약', '예약할래'), entry('배송조회', '어디쯤')],
    removed: [entry('매장예약', '찾아갈래')],
  }
  assertEquals(groupIntentDiff(diff), [
    { intent: '매장예약', added: ['예약할래'], removed: ['찾아갈래'] },
    { intent: '배송조회', added: ['어디쯤'], removed: [] },
  ])
})

Deno.test('처음 나온 순서를 지킨다 (추가가 먼저, 그 다음 삭제에서만 나온 인텐트)', () => {
  const diff = {
    added: [entry('나', 'a')],
    removed: [entry('가', 'b'), entry('나', 'c')],
  }
  assertEquals(groupIntentDiff(diff).map((g) => g.intent), ['나', '가'])
})

Deno.test('차이가 없으면 빈 배열', () => {
  assertEquals(groupIntentDiff({ added: [], removed: [] }), [])
})

Deno.test('없는 필드에도 견딘다', () => {
  assertEquals(groupIntentDiff({}), [])
})

Deno.test('같은 인텐트의 발화 순서를 지킨다', () => {
  const diff = { added: [entry('가', 'ㄱ'), entry('가', 'ㄴ')], removed: [] }
  assertEquals(groupIntentDiff(diff)[0].added, ['ㄱ', 'ㄴ'])
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { diffRows, buildKey, normalizeValue, readableKey, unionSetIndexes, KEY_SEP } from './diffRows.js'

const table = (headers, rows) => ({ headers, rows })
const plain = { keyIndexes: [0] }

Deno.test('normalizeValue: 기본은 원문 그대로다', () => {
  assertEquals(normalizeValue('  A  b ', {}), '  A  b ')
})

Deno.test('normalizeValue: 옵션을 켜면 트림·공백접기·소문자', () => {
  assertEquals(normalizeValue('  A   b ', { ignoreWhitespace: true }), 'A b')
  assertEquals(normalizeValue('AbC', { ignoreCase: true }), 'abc')
})

Deno.test('buildKey: 여러 키 컬럼을 NUL로 잇는다', () => {
  assertEquals(buildKey(['a', 'b', 'c'], [0, 1], {}), `a${KEY_SEP}b`)
})

Deno.test('buildKey: 보이는 구분자였다면 충돌했을 두 행이 구분된다', () => {
  const k1 = buildKey(['a|b', 'c'], [0, 1], {})
  const k2 = buildKey(['a', 'b|c'], [0, 1], {})
  assertEquals(k1 === k2, false)
})

Deno.test('readableKey: NUL을 보이는 구분자로 바꾼다', () => {
  assertEquals(readableKey(`정보${KEY_SEP}연락처`), '정보 / 연락처')
  assertEquals(readableKey('단일키'), '단일키')
  assertEquals(readableKey(null), '')
})

Deno.test('추가·삭제·변경을 각각 낸다', () => {
  const before = table(['id', 'v'], [['1', 'x'], ['2', 'y']])
  const after = table(['id', 'v'], [['1', 'X'], ['3', 'z']])
  const d = diffRows(before, after, plain)
  assertEquals(d.added.map((e) => e.key), ['3'])
  assertEquals(d.removed.map((e) => e.key), ['2'])
  assertEquals(d.changed.length, 1)
  assertEquals(d.changed[0].key, '1')
  assertEquals(d.changed[0].cells, [{ header: 'v', before: 'x', after: 'X' }])
})

Deno.test('달라진 셀이 없으면 changed에 들어가지 않는다', () => {
  const t = table(['id', 'v'], [['1', 'x']])
  const d = diffRows(t, table(['id', 'v'], [['1', 'x']]), plain)
  assertEquals(d.changed, [])
  assertEquals(d.added, [])
  assertEquals(d.removed, [])
})

Deno.test('키 컬럼 자체는 셀 비교에서 뺀다', () => {
  // 키 컬럼의 헤더 이름 자체가 좌우에서 다르다(ID vs id) — 키 컬럼이 셀 비교/컬럼
  // 집합 계산에서 제대로 빠졌다면 이 이름 차이는 어디에도 드러나지 않아야 한다.
  // (같은 헤더 이름으로 두면 정규화된 키가 같을 때 셀 값도 항상 정규화 후 같아지므로
  //  이 뮤테이션은 관측되지 않는다 — 헤더 이름을 다르게 해야 columnsAdded/Removed로 샌다.)
  const before = table(['ID', 'v'], [['A', 'x']])
  const after = table(['id', 'v'], [['a', 'x']])
  const d = diffRows(before, after, { keyIndexes: [0], ignoreCase: true })
  // 키가 같아 짝지어졌고, 키 컬럼의 대소문자 차이를 '변경'으로도 컬럼 추가/삭제로도 보이지 않는다
  assertEquals(d.changed, [])
  assertEquals(d.columnsAdded, [])
  assertEquals(d.columnsRemoved, [])
})

Deno.test('중복 키는 첫 행만 쓰고 경고한다 — 조용히 삼키지 않는다', () => {
  const before = table(['id', 'v'], [['1', 'x'], ['1', 'DUP']])
  const d = diffRows(before, table(['id', 'v'], [['1', 'x']]), plain)
  assertEquals(d.changed, [])
  assertEquals(d.warnings.length, 1)
  assertEquals(d.warnings[0].includes('왼쪽'), true)
})

Deno.test('한쪽에만 있는 컬럼은 columnsAdded/Removed로만 보고한다 (모든 행을 변경으로 만들지 않는다)', () => {
  // 추가된 컬럼('note')뿐 아니라 삭제된 컬럼('old')도 함께 둔다 — before 쪽에만 있는
  // 컬럼까지 shared에 새어 들어가면 after 쪽엔 없는 값과 비교돼 모든 행이 '변경'으로 보인다.
  const before = table(['id', 'v', 'old'], [['1', 'x', 'o1'], ['2', 'y', 'o2']])
  const after = table(['id', 'v', 'note'], [['1', 'x', 'n1'], ['2', 'y', 'n2']])
  const d = diffRows(before, after, plain)
  assertEquals(d.columnsAdded, ['note'])
  assertEquals(d.columnsRemoved, ['old'])
  assertEquals(d.changed, [])
})

Deno.test('컬럼 순서가 바뀌어도 이름으로 짝지어 결과가 같다', () => {
  const before = table(['id', 'a', 'b'], [['1', 'A', 'B']])
  const after = table(['id', 'b', 'a'], [['1', 'B', 'A']])
  const d = diffRows(before, after, plain)
  assertEquals(d.changed, [])
  assertEquals(d.columnsAdded, [])
  assertEquals(d.columnsRemoved, [])
})

Deno.test('이름이 겹치는 컬럼이 있으면 경고한다', () => {
  const before = table(['id', 'v', 'v'], [['1', 'x', 'y']])
  const d = diffRows(before, before, plain)
  assertEquals(d.warnings.some((w) => w.includes('중복')), true)
})

Deno.test('집합 컬럼은 순서를 무시한다', () => {
  const headers = ['e', 'val', 't', 'syn', '', '']
  const before = table(headers, [['정보', '연락처', 'synonyms', '전화', '번호', '']])
  const after = table(headers, [['정보', '연락처', 'synonyms', '번호', '전화', '']])
  const d = diffRows(before, after, { keyIndexes: [0, 1], setIndexes: [3, 4, 5] })
  assertEquals(d.changed, [])
})

Deno.test('집합 컬럼의 추가·삭제와 전체를 함께 낸다', () => {
  const headers = ['e', 'val', 't', 'syn', '', '']
  const before = table(headers, [['정보', '연락처', 'synonyms', '전화', '번호', '']])
  const after = table(headers, [['정보', '연락처', 'synonyms', '전화', '유선', '']])
  const d = diffRows(before, after, { keyIndexes: [0, 1], setIndexes: [3, 4, 5] })
  assertEquals(d.changed.length, 1)
  const s = d.changed[0].sets[0]
  assertEquals(s.header, 'syn')
  assertEquals(s.added, ['유선'])
  assertEquals(s.removed, ['번호'])
  assertEquals(s.beforeAll, ['전화', '번호'])
  assertEquals(s.afterAll, ['전화', '유선'])
})

Deno.test('집합의 빈 칸은 값이 아니다 (padRow가 채운 자리)', () => {
  // before/after가 완전히 동일하면 빈 칸을 값으로 세든 안 세든 결과가 같아
  // 이 테스트가 아무것도 지키지 못한다 — 실제 변경이 있는 쪽에서 beforeAll/afterAll에
  // 빈 문자열이 끼어들지 않는지를 확인한다.
  const headers = ['e', 'val', 't', 'syn', '', '']
  const before = table(headers, [['정보', '연락처', 'synonyms', '전화', '', '']])
  const after = table(headers, [['정보', '연락처', 'synonyms', '전화', '유선', '']])
  const d = diffRows(before, after, { keyIndexes: [0, 1], setIndexes: [3, 4, 5] })
  assertEquals(d.changed.length, 1)
  const s = d.changed[0].sets[0]
  assertEquals(s.beforeAll, ['전화'])
  assertEquals(s.afterAll, ['전화', '유선'])
  assertEquals(s.added, ['유선'])
  assertEquals(s.removed, [])
})

Deno.test('완화 옵션을 켜고 끄면 결과가 실제로 달라진다', () => {
  const before = table(['id', 'v'], [['1', 'Hello  World']])
  const after = table(['id', 'v'], [['1', 'hello world']])
  assertEquals(diffRows(before, after, { keyIndexes: [0] }).changed.length, 1)
  assertEquals(
    diffRows(before, after, { keyIndexes: [0], ignoreCase: true, ignoreWhitespace: true }).changed.length,
    0,
  )
})

Deno.test('완화 옵션은 키에도 똑같이 적용된다 (유령 변경 방지)', () => {
  const before = table(['id', 'v'], [[' A ', 'x']])
  const after = table(['id', 'v'], [['a', 'x']])
  const d = diffRows(before, after, { keyIndexes: [0], ignoreCase: true, ignoreWhitespace: true })
  assertEquals(d.added, [])
  assertEquals(d.removed, [])
  assertEquals(d.changed, [])
})

Deno.test('added·removed는 원본 행 순서를 지킨다', () => {
  const before = table(['id'], [])
  const after = table(['id'], [['b'], ['a'], ['c']])
  assertEquals(diffRows(before, after, plain).added.map((e) => e.row[0]), ['b', 'a', 'c'])
})

// ── Important 1 회귀 — before/after 헤더 길이가 다를 때 setIndexes를 양쪽 합집합으로
//    넘겨야 한다(호출부 계약). 여기서는 diffRows가 그 합집합을 받았을 때 실제로
//    옳게 처리하는지 — 특히 대표 이름 폴백 — 를 고정한다.

Deno.test('집합: after 헤더가 더 넓을 때 늘어난 값이 changed로 잡히고 이름 없는 컬럼이 새지 않는다', () => {
  const beforeHeaders = ['e', 'val', 't', 'syn', '', '']
  const afterHeaders = ['e', 'val', 't', 'syn', '', '', '', '']
  const before = table(beforeHeaders, [['정보', '연락처', 'entity', '전화', '번호', '']])
  const after = table(afterHeaders, [['정보', '연락처', 'entity', '전화', '번호', '', '유선', '팩스']])
  // ComparePage.jsx가 넘겨야 할 합집합: before.setIndexes(3,4,5) ∪ after.setIndexes(3..7)
  const setIndexes = [3, 4, 5, 6, 7]
  const d = diffRows(before, after, { keyIndexes: [0, 1], setIndexes })
  assertEquals(d.changed.length, 1)
  assertEquals(d.changed[0].sets[0].added, ['유선', '팩스'])
  assertEquals(d.changed[0].sets[0].removed, [])
  assertEquals(d.columnsAdded.includes(''), false)
})

Deno.test('집합: after 헤더가 더 좁을 때 줄어든 값이 changed로 잡힌다', () => {
  const beforeHeaders = ['e', 'val', 't', 'syn', '', '', '', '']
  const afterHeaders = ['e', 'val', 't', 'syn', '', '']
  const before = table(beforeHeaders, [['정보', '연락처', 'entity', '전화', '번호', '', '유선', '팩스']])
  const after = table(afterHeaders, [['정보', '연락처', 'entity', '전화', '번호', '']])
  const setIndexes = [3, 4, 5, 6, 7]
  const d = diffRows(before, after, { keyIndexes: [0, 1], setIndexes })
  assertEquals(d.changed.length, 1)
  assertEquals(d.changed[0].sets[0].removed, ['유선', '팩스'])
  assertEquals(d.changed[0].sets[0].added, [])
})

Deno.test('집합 대표 이름: before 쪽 자리 헤더가 비어 있으면 after 이름으로 대체한다', () => {
  const beforeHeaders = ['e', 'val', 't', '', '']
  const afterHeaders = ['e', 'val', 't', 'syn', '']
  const before = table(beforeHeaders, [['정보', '연락처', 'entity', '전화', '번호']])
  const after = table(afterHeaders, [['정보', '연락처', 'entity', '전화', '유선']])
  const d = diffRows(before, after, { keyIndexes: [0, 1], setIndexes: [3, 4] })
  assertEquals(d.changed[0].sets[0].header, 'syn')
})

// ── unionSetIndexes — 재리뷰 후속: ComparePage.jsx가 컴포넌트 안에서 직접 계산하던
//    (그래서 한 번 버그가 났던) 합집합을 순수 함수로 뽑아 테스트를 붙인다.

Deno.test('unionSetIndexes: 양쪽이 같으면 그대로', () => {
  assertEquals(unionSetIndexes([3, 4, 5], [3, 4, 5]), [3, 4, 5])
})

Deno.test('unionSetIndexes: 한쪽이 더 넓으면 넓은 쪽까지 포함한다', () => {
  assertEquals(unionSetIndexes([3, 4, 5], [3, 4, 5, 6, 7]), [3, 4, 5, 6, 7])
  assertEquals(unionSetIndexes([3, 4, 5, 6, 7], [3, 4, 5]), [3, 4, 5, 6, 7])
})

Deno.test('unionSetIndexes: 양쪽 다 빈 배열이면 빈 배열이다 (인텐트·ESD처럼 집합 컬럼이 없는 종류)', () => {
  assertEquals(unionSetIndexes([], []), [])
})

Deno.test('unionSetIndexes: 순서가 섞여 들어와도 오름차순으로 나온다', () => {
  assertEquals(unionSetIndexes([5, 3, 4], [7, 6]), [3, 4, 5, 6, 7])
})

Deno.test('unionSetIndexes: 중복이 제거된다', () => {
  assertEquals(unionSetIndexes([3, 3, 4], [4, 5]), [3, 4, 5])
})

Deno.test('unionSetIndexes: 인자가 undefined여도 던지지 않는다', () => {
  assertEquals(unionSetIndexes(undefined, undefined), [])
  assertEquals(unionSetIndexes([3, 4], undefined), [3, 4])
  assertEquals(unionSetIndexes(undefined, [3, 4]), [3, 4])
})

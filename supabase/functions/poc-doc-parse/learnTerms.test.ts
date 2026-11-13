import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { planLearnWrites, validateLearnable } from './learnTerms.ts'
import { MAPPABLE_FIELDS } from '../../../src/lib/pocDoc/termDictionary.ts'

const KNOWN = [{ field: '진입 발화', terms: ['Intent'] }]

Deno.test('새 용어만 학습 대상이 된다', () => {
  assertEquals(validateLearnable([{ column: 'Trigger Utterance', field: '진입 발화' }], KNOWN),
    [{ field: '진입 발화', term: 'Trigger Utterance' }])
})

Deno.test('이미 있는 용어는 제외한다 — 대소문자 무시', () => {
  assertEquals(validateLearnable([{ column: 'intent', field: '진입 발화' }], KNOWN), [])
})

Deno.test('모르는 필드는 버린다', () => {
  assertEquals(validateLearnable([{ column: 'X', field: '해킹' }], KNOWN), [])
})

Deno.test('너무 긴 용어는 버린다', () => {
  assertEquals(validateLearnable([{ column: 'a'.repeat(41), field: '분기' }], KNOWN), [])
})

Deno.test('탭과 줄바꿈이 있으면 버린다', () => {
  assertEquals(validateLearnable([{ column: 'a\tb', field: '분기' }], KNOWN), [])
  assertEquals(validateLearnable([{ column: 'a\nb', field: '분기' }], KNOWN), [])
})

Deno.test('빈 문자열과 공백만이면 버린다', () => {
  assertEquals(validateLearnable([{ column: '   ', field: '분기' }], KNOWN), [])
})

Deno.test('필드가 비면 학습하지 않는다 — 이 열은 무시', () => {
  assertEquals(validateLearnable([{ column: 'X', field: '' }], KNOWN), [])
  assertEquals(validateLearnable([{ column: 'X', field: null }], KNOWN), [])
})

Deno.test('같은 요청에 중복이 있으면 한 번만', () => {
  assertEquals(validateLearnable(
    [{ column: 'Slot', field: '수집 정보' }, { column: 'slot', field: '수집 정보' }], KNOWN).length, 1)
})

Deno.test('배열이 아니면 빈 배열 — 던지지 않는다', () => {
  assertEquals(validateLearnable(null, KNOWN), [])
  assertEquals(validateLearnable('x', KNOWN), [])
  assertEquals(validateLearnable([{ column: 'A', field: '분기' }], null), [{ field: '분기', term: 'A' }])
})

// ⚠ 앞선 태스크는 하이픈이 낀 케이스가 없어서 CONTROL_OR_SEP 이스케이프 붕괴 버그를 못 잡았다.
// 여기서는 정상적인 하이픈·괄호·숫자 조합이 "제어문자로 오인돼 버려지지 않는지"를 확인한다(회귀 확인).
Deno.test('하이픈이 낀 정상 용어는 통과한다 — 기능-ID (회귀 확인)', () => {
  assertEquals(validateLearnable([{ column: '기능-ID', field: '분기' }], KNOWN),
    [{ field: '분기', term: '기능-ID' }])
})

Deno.test('괄호·하이픈이 섞인 정상 용어는 통과한다 — 전화(010-1234) (회귀 확인)', () => {
  assertEquals(validateLearnable([{ column: '전화(010-1234)', field: '분기' }], KNOWN),
    [{ field: '분기', term: '전화(010-1234)' }])
})

// --- 리뷰 후속: 상한·보이지 않는 문자 ---

Deno.test('필드당 30개 상한 — 이미 30개인 필드에 새 용어를 주면 결과가 비어 있다', () => {
  const known = [{ field: '분기', terms: Array.from({ length: 30 }, (_, i) => `t${i}`) }]
  assertEquals(validateLearnable([{ column: 'NewTerm', field: '분기' }], known), [])
})

Deno.test('요청당 20개 상한 — 25개를 주면 20개만 나온다', () => {
  const mapping = Array.from({ length: 25 }, (_, i) =>
    ({ column: `c${i}`, field: MAPPABLE_FIELDS[i % MAPPABLE_FIELDS.length] }))
  assertEquals(validateLearnable(mapping, []).length, 20)
})

Deno.test('ZWSP(폭없는 공백)가 든 용어는 버려진다', () => {
  const zwsp = '​'
  assertEquals(validateLearnable([{ column: `기능${zwsp}` , field: '분기' }], KNOWN), [])
})

Deno.test('NBSP(줄바꿈 없는 공백)가 든 용어는 버려진다', () => {
  const nbsp = ' '
  assertEquals(validateLearnable([{ column: `기능${nbsp}ID`, field: '분기' }], KNOWN), [])
})

Deno.test('보통 공백·하이픈은 여전히 통과한다 — 회귀 확인', () => {
  assertEquals(validateLearnable([{ column: '기능 ID', field: '분기' }], KNOWN),
    [{ field: '분기', term: '기능 ID' }])
})

// --- 리뷰 후속 2차: planLearnWrites(무엇을 쓸지 결정하는 순수 함수) ---
// index.ts(HTTP 핸들러) 안에 있던 "entries가 비면 학습을 건너뛴다" 핵심 가드를
// 여기로 옮겼다 — 이 저장소 테스트 스위트로는 index.ts 안의 로직을 직접 검증할 수
// 없기 때문. 아래 첫 테스트가 그 가드를 고정한다.
//
// 반환형이 LearnWrite[] 에서 { writes, skipped }(LearnPlan)로 바뀌었다(리뷰 3라운드) —
// row가 없어 건너뛴 필드를 조용히 버리지 않고 사유를 남기기 위함. 함수 자체는
// console을 부르지 않는다(순수성 유지) — 로그는 index.ts가 skipped를 보고 남긴다.

Deno.test('planLearnWrites: entries가 빈 배열이면 결과가 빈 배열이다 (핵심 가드)', () => {
  assertEquals(planLearnWrites([], [{ field: '분기', term: 'NewTerm' }]).writes, [])
})

Deno.test('planLearnWrites: entries가 null이어도 빈 배열 — 던지지 않는다', () => {
  assertEquals(planLearnWrites(null, [{ field: '분기', term: 'NewTerm' }]).writes, [])
})

Deno.test('planLearnWrites: 같은 필드에 용어 2개를 주면 LearnWrite 하나에 둘 다 들어간다', () => {
  const entries = [{ field: '분기', terms: ['조건'], source: 'seed' }]
  const { writes } = planLearnWrites(entries, [
    { field: '분기', term: 'A' },
    { field: '분기', term: 'B' },
  ])
  assertEquals(writes.length, 1)
  assertEquals(writes[0].field, '분기')
  assertEquals(writes[0].terms, ['조건', 'A', 'B'])
  assertEquals(writes[0].userTerms, ['A', 'B'])
})

Deno.test('planLearnWrites: entries에 없는 필드는 결과에서 빠진다', () => {
  const entries = [{ field: '분기', terms: ['조건'], source: 'seed' }]
  const { writes } = planLearnWrites(entries, [{ field: '외부 연동', term: 'Webhook' }])
  assertEquals(writes, [])
})

Deno.test('planLearnWrites: content 병합이 source를 보존한다', () => {
  const entries = [{ field: '분기', terms: ['조건'], source: 'seed' }]
  const { writes } = planLearnWrites(entries, [{ field: '분기', term: 'A' }])
  assertEquals(writes.length, 1)
  assertEquals(writes[0].content.source, 'seed')
  assertEquals(writes[0].content.terms, ['조건', 'A'])
  assertEquals(writes[0].content.userTerms, ['A'])
})

Deno.test('planLearnWrites: 필드당 30개 상한을 넘으면 그 필드가 빠진다', () => {
  const entries = [{ field: '분기', terms: Array.from({ length: 30 }, (_, i) => `t${i}`), source: 'seed' }]
  const { writes } = planLearnWrites(entries, [{ field: '분기', term: 'NewTerm' }])
  assertEquals(writes, [])
})

// --- 리뷰 후속 3차: skipped — row 없어 건너뛴 필드를 조용히 버리지 않는다 ---
// MAPPABLE_FIELDS 6개 중 '외부 연동'은 시드 마이그레이션이 행을 안 만든다(5행만 INSERT).
// 그래서 이 케이스는 이론이 아니라 실제로 항상 벌어지는 경로다.

Deno.test('skipped: entries에 없는 필드를 학습시키면 skipped에 no-row가 들어간다', () => {
  const entries = [{ field: '분기', terms: ['조건'], source: 'seed' }]
  const { skipped } = planLearnWrites(entries, [{ field: '외부 연동', term: 'Webhook' }])
  assertEquals(skipped, [{ field: '외부 연동', reason: 'no-row' }])
})

Deno.test('skipped: 필드당 30개 상한에 걸리면 skipped에 field-cap이 들어간다', () => {
  const entries = [{ field: '분기', terms: Array.from({ length: 30 }, (_, i) => `t${i}`), source: 'seed' }]
  const { skipped } = planLearnWrites(entries, [{ field: '분기', term: 'NewTerm' }])
  assertEquals(skipped, [{ field: '분기', reason: 'field-cap' }])
})

Deno.test('skipped: 정상 학습만 있으면 skipped가 빈 배열이다', () => {
  const entries = [{ field: '분기', terms: ['조건'], source: 'seed' }]
  const { skipped } = planLearnWrites(entries, [{ field: '분기', term: 'A' }])
  assertEquals(skipped, [])
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { renderLayoutGuide, suggestField, renderConfirmedColumns, MAPPABLE_FIELDS } from './termDictionary.ts'

const ENTRIES = [
  { field: '시나리오 이름', terms: ['시나리오', 'Usecase', '기능명'] },
  { field: '진입 발화', terms: ['질의', 'Intent'] },
]

Deno.test('사전을 프롬프트 지침 텍스트로 렌더한다', () => {
  const s = renderLayoutGuide(ENTRIES)
  assertEquals(s.includes('시나리오 이름'), true, s)
  assertEquals(s.includes('Usecase'), true, s)
  assertEquals(s.includes('Intent'), true, s)
})

Deno.test('빈 사전은 빈 문자열 — 섹션 자체를 넣지 않는다', () => {
  assertEquals(renderLayoutGuide([]), '')
  assertEquals(renderLayoutGuide(null), '')
})

Deno.test('용어가 없는 항목은 렌더에서 빠진다', () => {
  assertEquals(renderLayoutGuide([{ field: '분기', terms: [] }]), '')
})

Deno.test('열 이름으로 필드를 제안한다 — 대소문자 무시', () => {
  assertEquals(suggestField('usecase', ENTRIES), '시나리오 이름')
  assertEquals(suggestField('Intent', ENTRIES), '진입 발화')
})

Deno.test('앞뒤 공백을 무시한다', () => {
  assertEquals(suggestField('  기능명 ', ENTRIES), '시나리오 이름')
})

Deno.test('모르는 열은 null', () => {
  assertEquals(suggestField('비고', ENTRIES), null)
  assertEquals(suggestField('', ENTRIES), null)
  assertEquals(suggestField(null, ENTRIES), null)
})

Deno.test('먼저 등록된 항목이 이긴다 — 같은 용어가 두 필드에 있으면', () => {
  const dup = [{ field: 'A', terms: ['x'] }, { field: 'B', terms: ['x'] }]
  assertEquals(suggestField('x', dup), 'A')
})

Deno.test('확정 매핑을 강제 지침으로 렌더한다', () => {
  const s = renderConfirmedColumns([{ column: 'Trigger Utterance', field: '진입 발화' }])
  assertEquals(s.includes('Trigger Utterance'), true, s)
  assertEquals(s.includes('진입 발화'), true, s)
})

Deno.test('확정 매핑이 없으면 빈 문자열', () => {
  assertEquals(renderConfirmedColumns([]), '')
  assertEquals(renderConfirmedColumns(null), '')
})

Deno.test('매핑 가능한 필드는 6개다', () => {
  assertEquals(MAPPABLE_FIELDS.length, 6)
  assertEquals(MAPPABLE_FIELDS.includes('시나리오 이름'), true)
  assertEquals(MAPPABLE_FIELDS.includes('외부 연동'), true)
})

// 타입 가드 테스트 (DB jsonb가 형태 보장 안 함)
Deno.test('field가 문자열 아니면 renderLayoutGuide에서 빠진다', () => {
  assertEquals(renderLayoutGuide([{ field: 123, terms: ['x'] }]), '')
})

Deno.test('field가 없는 항목도 renderLayoutGuide에서 빠진다', () => {
  assertEquals(renderLayoutGuide([{ terms: ['x'] }]), '')
})

Deno.test('column이 문자열 아니면 renderConfirmedColumns에서 빠진다', () => {
  assertEquals(renderConfirmedColumns([{ column: 123, field: '분기' }]), '')
})

Deno.test('field가 null이면 renderConfirmedColumns에서 빠진다 — 효과적 여부만', () => {
  const result = renderConfirmedColumns([{ column: 'A', field: null }, { column: 'B', field: '분기' }])
  assertEquals(result.includes('B'), true, result)
  assertEquals(result.includes('A'), false, result)
})

// 제어문자 정제 테스트
Deno.test('용어에 줄바꿈이 있으면 한 줄로 합쳐진다', () => {
  const s = renderLayoutGuide([{ field: '분기', terms: ['a\nb'] }])
  assertEquals(s.includes('a b'), true, s)
  assertEquals(s.includes('a\nb'), false, s)
})

Deno.test('열 이름에 줄바꿈이 있어도 renderConfirmedColumns 출력이 한 줄 형태를 유지한다', () => {
  const s = renderConfirmedColumns([{ column: 'Col\nName', field: '분기' }])
  assertEquals(s.split('\n').length >= 3, true, s)
  assertEquals(s.includes('Col\nName'), false, s)
})

Deno.test('정제 후 빈 문자열이 되는 용어는 빠진다', () => {
  assertEquals(renderLayoutGuide([{ field: '분기', terms: ['   '] }]), '')
})

// 정상 문자 보존 테스트 (하이픈, 괄호, 영문숫자 등)
Deno.test('renderLayoutGuide에서 정상 문자(하이픈·괄호·숫자 등)가 보존된다', () => {
  const s = renderLayoutGuide([{ field: '분기', terms: ['기능-ID', 'Request Data', '전화(010-1234)'] }])
  assertEquals(s.includes('기능-ID'), true, s)
  assertEquals(s.includes('Request Data'), true, s)
  assertEquals(s.includes('전화(010-1234)'), true, s)
})

Deno.test('renderConfirmedColumns에서 정상 문자(하이픈 등)가 보존된다', () => {
  const s = renderConfirmedColumns([{ column: '기능-ID', field: '시나리오 이름' }])
  assertEquals(s.includes('기능-ID'), true, s)
})

// 진짜 제어문자 걸러짐 테스트
Deno.test('renderLayoutGuide에서 진짜 제어문자(NUL 등)가 제거된다', () => {
  const s = renderLayoutGuide([{ field: '분기', terms: ['a\x00b'] }])
  assertEquals(s.includes('a b'), true, s)
  assertEquals(s.includes('a\x00b'), false, s)
})

// suggestField의 sanitize 적용 테스트
Deno.test('suggestField에서 사전의 줄바꿈이 공백으로 정제돼 매칭된다', () => {
  assertEquals(suggestField('Trigger Utterance', [{ field: '진입 발화', terms: ['Trigger\nUtterance'] }]), '진입 발화')
})

// content.key(응답 스키마의 영문 키) 렌더 — 한글 라벨만 내면 LLM이 라벨과 JSON 키를 잇지 못한다.
Deno.test('사전에 key가 있으면 "라벨(key)" 형태로 렌더한다', () => {
  const s = renderLayoutGuide([{ field: '시나리오 이름', key: 'name', terms: ['Usecase'] }])
  assertEquals(s.includes('시나리오 이름(name)'), true, s)
})

Deno.test('key가 없으면 라벨만 렌더한다 — 괄호를 지어내지 않는다', () => {
  const s = renderLayoutGuide([{ field: '분기', terms: ['비고'] }])
  assertEquals(s.includes('- 분기: 비고'), true, s)
  // 헤더 줄에는 '(표)'가 있으므로 전체 문자열이 아니라 "필드 뒤 괄호"가 없음을 본다.
  assertEquals(s.includes('분기('), false, s)
})

Deno.test('여섯 필드의 key가 모두 렌더된다', () => {
  const s = renderLayoutGuide([
    { field: '시나리오 이름', key: 'name', terms: ['a'] },
    { field: '진입 발화', key: 'trigger', terms: ['b'] },
    { field: '수집 정보', key: 'collect', terms: ['c'] },
    { field: '완료 시 결과', key: 'done', terms: ['d'] },
    { field: '분기', key: 'branches', terms: ['e'] },
    { field: '외부 연동', key: 'integrations', terms: ['f'] },
  ])
  for (const k of ['(name)', '(trigger)', '(collect)', '(done)', '(branches)', '(integrations)']) {
    assertEquals(s.includes(k), true, `${k} 누락: ${s}`)
  }
})

// 크기 상한 — 학습 경로(learnTerms.ts)는 40자/20개로 막혀 있는데 프롬프트 경로가 무제한이면
// 병합셀 문서의 거대한 헤더나 열 200개짜리 표가 그대로 프롬프트에 실린다.
Deno.test('60자를 넘는 열 이름은 확정 매핑 렌더에서 빠진다', () => {
  const long = 'A'.repeat(61)
  const s = renderConfirmedColumns([{ column: long, field: '분기' }, { column: 'B', field: '분기' }])
  assertEquals(s.includes(long), false, s)
  assertEquals(s.includes('"B"'), true, s)
})

Deno.test('정확히 60자인 열 이름은 남는다 — 경계', () => {
  const edge = 'A'.repeat(60)
  assertEquals(renderConfirmedColumns([{ column: edge, field: '분기' }]).includes(edge), true)
})

Deno.test('확정 매핑 항목은 40개까지만 렌더한다', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ column: `열${i}`, field: '분기' }))
  const s = renderConfirmedColumns(many)
  assertEquals(s.split('\n').filter((l) => l.startsWith('- ')).length, 40, s.slice(0, 200))
  assertEquals(s.includes('"열39"'), true)
  assertEquals(s.includes('"열40"'), false)
})

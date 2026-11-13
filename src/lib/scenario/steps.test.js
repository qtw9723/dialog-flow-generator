import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  stepsToLegacy, legacyToSteps, withDerivedLegacy, promptView, mapScenarioResponses,
  varsBefore, integrationStepPath, validateSteps, makeEmptyIntegration, availableStepTypes,
} from './steps.js'

const collect = (...names) => ({ 유형: '정보 받기', 항목: names.map((n) => ({ 항목명: n, 변수명: '' })) })
const esd = (purpose, result) => ({ 유형: '연동', '연동 방식': '내부 데이터 저장·조회 (ESD)', '연동 목적': purpose, '결과를 담을 이름': result })
const branch = (...rows) => ({ 유형: '분기', 갈래: rows })

const STEPS = [
  collect('연락처'),
  esd('회원 조회', '회원정보'),
  branch(
    { '조건 대상': '회원정보', 연산자: '있음', 값: '', '직접 입력 조건': '', '그 경우 봇의 행동': '회원 인사', 이후: '이어서 진행' },
    { '직접 입력 조건': '회원정보 없음', '그 경우 봇의 행동': '비회원 안내', 이후: '여기서 종료' },
  ),
  { 유형: '안내', 내용: '예약 안내' },
  collect('예약일'),
  esd('예약 저장', '예약결과'),
]

Deno.test('stepsToLegacy — 정보 받기 항목을 순서대로 잇고, 연동·분기 갈래를 모은다', () => {
  const out = stepsToLegacy({ 단계: STEPS })
  assertEquals(out['수집 정보'].map((i) => i.항목명), ['연락처', '예약일'])
  assertEquals(out['외부 연동'].map((i) => i['연동 목적']), ['회원 조회', '예약 저장'])
  assertEquals(out['외부 연동'][0].유형, undefined)
  assertEquals(out['분기'].map((r) => r.이후), ['이어서 진행', '여기서 종료'])
  assertEquals(stepsToLegacy({ '수집 정보': [] }), null)
})

Deno.test('legacyToSteps — 정보 받기 → 연동 각각 → 분기 순, 갈래 이후 기본은 이어서 진행', () => {
  const legacy = {
    '수집 정보': [{ 항목명: '이름' }, { 항목명: '연락처' }],
    '외부 연동': [{ '연동 목적': 'a' }, { '연동 목적': 'b' }],
    '분기': [{ '직접 입력 조건': 'x', '그 경우 봇의 행동': 'y' }],
  }
  const steps = legacyToSteps(legacy)
  assertEquals(steps.map((s) => s.유형), ['정보 받기', '연동', '연동', '분기'])
  assertEquals(steps[0].항목.length, 2)
  assertEquals(steps[3].갈래[0].이후, '이어서 진행')
  assertEquals(legacyToSteps({}), [])
})

Deno.test('legacy→steps→legacy 무손실(이후 기본값만 추가)', () => {
  const legacy = {
    '수집 정보': [{ 항목명: '이름', 변수명: 'name' }],
    '외부 연동': [{ '연동 목적': 'a', _tested: true }],
    '분기': [{ '직접 입력 조건': 'x', '그 경우 봇의 행동': 'y', 이후: '여기서 종료' }],
  }
  assertEquals(stepsToLegacy({ 단계: legacyToSteps(legacy) }), legacy)
})

Deno.test('withDerivedLegacy — 단계가 있으면 기존 키를 덮어쓰고, 없으면 원본 그대로', () => {
  const s = { '시나리오 이름': 'a', 단계: [collect('이름')], '수집 정보': [{ 항목명: '옛값' }] }
  assertEquals(withDerivedLegacy(s)['수집 정보'].map((i) => i.항목명), ['이름'])
  const legacy = { '수집 정보': [{ 항목명: '옛값' }] }
  assertEquals(withDerivedLegacy(legacy), legacy)
})

Deno.test('promptView — 단계가 있으면 기존 세 키 제거, 없으면 원본, 레퍼런스 선택이면 단계만 제거', () => {
  const s = { '시나리오 이름': 'a', 단계: [collect('이름')], '수집 정보': [1], '외부 연동': [], 분기: [] }
  assertEquals(Object.keys(promptView(s)).sort(), ['단계', '시나리오 이름'].sort())
  const legacy = { '수집 정보': [1] }
  assertEquals(promptView(legacy), legacy)
  const seeded = { ...s, '레퍼런스 선택': '배송 조회봇' }
  const { 단계: _dropped, ...seededWithoutSteps } = seeded
  assertEquals(promptView(seeded), seededWithoutSteps) // 시드가 구조를 덮으므로 단계만 뺀다(최종 리뷰 #4)
})

Deno.test('mapScenarioResponses — 객체 배열 응답만 시나리오로 보고 변환, 나머지는 그대로', () => {
  const responses = { q1: '봇', q2: [{ a: 1 }, { a: 2 }], q3: ['x'] }
  const out = mapScenarioResponses(responses, (s) => ({ ...s, b: true }))
  assertEquals(out, { q1: '봇', q2: [{ a: 1, b: true }, { a: 2, b: true }], q3: ['x'] })
})

Deno.test('varsBefore — k 이전 단계의 변수명(없으면 항목명)·결과 이름만', () => {
  const steps = [{ 유형: '정보 받기', 항목: [{ 항목명: '연락처', 변수명: 'phone' }, { 항목명: '이름', 변수명: '' }] }, esd('조회', '회원정보'), collect('예약일')]
  assertEquals(varsBefore(steps, 0), [])
  assertEquals(varsBefore(steps, 1), ['phone', '이름'])
  assertEquals(varsBefore(steps, 2), ['phone', '이름', '회원정보'])
})

Deno.test('integrationStepPath — n번째 연동이 몇 번째 단계인지(갈래 하위 단계가 없으면 최상위 경로)', () => {
  assertEquals(integrationStepPath(STEPS, 0), [1])
  assertEquals(integrationStepPath(STEPS, 1), [5])
  assertEquals(integrationStepPath(STEPS, 2), null)
})

Deno.test('validateSteps — 분기 갈래는 (조건 대상+연산자) 또는 직접 입력 조건, 그리고 행동이 필요', () => {
  assertEquals(validateSteps(STEPS), null)
  const bad = [collect('a'), branch({ '그 경우 봇의 행동': 'x', 이후: '이어서 진행' })]
  assertEquals(validateSteps(bad).stepIndex, 1)
  const noAction = [branch({ '직접 입력 조건': 'x', 이후: '이어서 진행' })]
  assertEquals(validateSteps(noAction).stepIndex, 0)
  const emptyBranch = [branch()]
  assertEquals(validateSteps(emptyBranch).stepIndex, 0)
  const emptyMsg = [{ 유형: '안내', 내용: ' ' }]
  assertEquals(validateSteps(emptyMsg).stepIndex, 0)
  assertEquals(validateSteps(undefined), null)
})

// ── 최종 리뷰 반영(2026-10-20) ──

Deno.test('legacyToSteps — 단계마다 고유 _id(카드 key), stepsToLegacy·promptView에는 _id가 새지 않는다', () => {
  const steps = legacyToSteps({ '수집 정보': [{ 항목명: 'a' }], '외부 연동': [{ '연동 목적': 'x' }, { '연동 목적': 'y' }] })
  const ids = steps.map((s) => s._id)
  assertEquals(ids.every((id) => typeof id === 'string' && id.length > 0), true)
  assertEquals(new Set(ids).size, ids.length)
  const legacy = stepsToLegacy({ 단계: steps })
  assertEquals(legacy['외부 연동'].some((e) => '_id' in e), false)
  const view = promptView({ 단계: steps })
  assertEquals(view.단계.some((s) => '_id' in s), false)
})

Deno.test('validateSteps — 앞 단계에 없는 변수를 보낼 정보·조건 대상으로 쓰면 그 단계에서 막는다(순서 변경 후 잔존값)', () => {
  const moved = [
    { 유형: '연동', '연동 목적': '조회', '보낼 정보': ['phone'], '결과를 담을 이름': 'm' },
    { 유형: '정보 받기', 항목: [{ 항목명: '연락처', 변수명: 'phone' }] },
  ]
  assertEquals(validateSteps(moved).stepIndex, 0)
  const branchStale = [
    branch({ '조건 대상': 'memberInfo', 연산자: '같음', 값: 'a', '그 경우 봇의 행동': 'x', 이후: '이어서 진행' }),
    esd('조회', 'memberInfo'),
  ]
  assertEquals(validateSteps(branchStale).stepIndex, 0)
  const direct = [branch({ '조건 대상': '직접 입력', '직접 입력 조건': '아무 조건', '그 경우 봇의 행동': 'x', 이후: '이어서 진행' })]
  assertEquals(validateSteps(direct), null)
  assertEquals(validateSteps(STEPS), null)
})

Deno.test('promptView — 레퍼런스 선택 시나리오는 단계를 빼서(시드가 구조를 덮으므로) 기능 이전 입력과 같게', () => {
  const seeded = { '시나리오 이름': 'a', '레퍼런스 선택': '배송 조회봇', 단계: [collect('이름')], '수집 정보': [{ 항목명: '이름' }] }
  const view = promptView(seeded)
  assertEquals('단계' in view, false)
  assertEquals(view['수집 정보'], seeded['수집 정보'])
})

// ── 미뤄 둔 항목 반영(2026-10-20) ──

Deno.test('validateSteps — 받을 항목이 하나도 없는 정보 받기 단계는 막는다', () => {
  assertEquals(validateSteps([{ 유형: '정보 받기', 항목: [] }]).stepIndex, 0)
})

Deno.test('makeEmptyIntegration — 연동 편집기의 "+ 추가"와 같은 기본값(API·새로 입력·GET·_tested=false)', () => {
  const e = makeEmptyIntegration()
  assertEquals(e['연동 방식'], '외부 시스템 호출 (API)')
  assertEquals(e['사용할 API'], '새로 입력')
  assertEquals(e.method, 'GET')
  assertEquals(e['바디 형식'], 'kv')
  assertEquals(e._tested, false)
  assertEquals(e['보낼 정보'], [])
  // 매번 새 객체(배열 공유 금지)
  assertEquals(makeEmptyIntegration()['보낼 정보'] === e['보낼 정보'], false)
})

Deno.test('availableStepTypes — 템플릿에 해당 필드가 있는 유형만(안내는 항상)', () => {
  const tpl = (names) => ({ fields: names.map((name) => ({ name })) })
  assertEquals(availableStepTypes(tpl(['수집 정보', '분기', '외부 연동'])), ['정보 받기', '안내', '연동', '분기'])
  assertEquals(availableStepTypes(tpl(['수집 정보'])), ['정보 받기', '안내'])
  assertEquals(availableStepTypes(null), ['안내'])
})

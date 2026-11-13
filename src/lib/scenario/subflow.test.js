import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  stepsToLegacy, promptView, varsAt, varsBefore, validateSteps, integrationStepPath,
  stepsAt, setStepsAt, branchStepCount,
} from './steps.js'

// 분기 갈래별 하위 흐름 — 설계 docs/superpowers/specs/2026-10-21-branch-subflows-design.md
const collect = (name, v) => ({ 유형: '정보 받기', 항목: [{ 항목명: name, 변수명: v }] })
const esd = (purpose, result) => ({ 유형: '연동', '연동 방식': '내부 데이터 저장·조회 (ESD)', '연동 목적': purpose, '결과를 담을 이름': result })
const SUB = [
  collect('연락처', 'phone'),
  esd('회원 조회', 'memberInfo'),
  { 유형: '분기', 갈래: [
    { '조건 대상': 'memberInfo', 연산자: '있음', '그 경우 봇의 행동': '', 이후: '이어서 진행',
      단계: [{ _id: 'x1', 유형: '안내', 내용: '회원 인사' }, collect('예약일', 'reservationDate'), esd('예약 저장', 'reservation')] },
    { '직접 입력 조건': '회원 없음', '그 경우 봇의 행동': '가입 안내', 이후: '여기서 종료',
      단계: [collect('이름', 'guestName')] },
  ] },
  { 유형: '안내', 내용: '마무리' },
]

Deno.test('stepsToLegacy — 갈래 안까지 깊이 우선으로 모으고, 분기 행에는 하위 단계를 싣지 않는다', () => {
  const out = stepsToLegacy({ 단계: SUB })
  assertEquals(out['수집 정보'].map((i) => i.변수명), ['phone', 'reservationDate', 'guestName'])
  assertEquals(out['외부 연동'].map((i) => i['연동 목적']), ['회원 조회', '예약 저장'])
  assertEquals(out['분기'].length, 2)
  assertEquals('단계' in out['분기'][0], false)
})

Deno.test('promptView — 중첩 단계의 _id도 지운다', () => {
  const v = promptView({ 단계: SUB })
  assertEquals(v['단계'][2].갈래[0].단계[0], { 유형: '안내', 내용: '회원 인사' })
})

Deno.test('varsAt — 갈래 안은 분기 앞 + 같은 갈래 앞 단계만, 다른 갈래 변수는 없다', () => {
  assertEquals(varsAt(SUB, [2, 0, 2]), ['phone', 'memberInfo', 'reservationDate'])
  assertEquals(varsAt(SUB, [2, 1, 0]), ['phone', 'memberInfo'])
  // 분기 뒤: 앞 단계 + '이어서 진행' 갈래 변수만(종료 갈래의 guestName 제외)
  assertEquals(varsAt(SUB, [3]), ['phone', 'memberInfo', 'reservationDate', 'reservation'])
  assertEquals(varsBefore(SUB, 3), varsAt(SUB, [3]))
})

Deno.test('stepsAt / setStepsAt — 경로로 목록을 읽고 불변으로 바꾼다', () => {
  assertEquals(stepsAt(SUB, []).length, 4)
  assertEquals(stepsAt(SUB, [2, 1]).length, 1)
  assertEquals(stepsAt(SUB, [2, 5]), [])
  const next = setStepsAt(SUB, [2, 1], [])
  assertEquals(next[2].갈래[1].단계, [])
  assertEquals(SUB[2].갈래[1].단계.length, 1)
  assertEquals(next[2].갈래[0], SUB[2].갈래[0])
  assertEquals(setStepsAt(SUB, [], [SUB[0]]), [SUB[0]])
})

Deno.test('validateSteps — 갈래 안 단계도 검증하고 경로를 돌려준다', () => {
  const bad = structuredClone(SUB)
  bad[2].갈래[0].단계[0].내용 = ''
  const fail = validateSteps(bad)
  assertEquals(fail.path, [2, 0, 0])
  assertEquals(fail.stepIndex, 2)
})

Deno.test("validateSteps — '그 경우 봇의 행동'은 갈래에 단계가 없을 때만 필수", () => {
  assertEquals(validateSteps(SUB), null)
  const noSteps = structuredClone(SUB)
  noSteps[2].갈래[0].단계 = []
  assertEquals(validateSteps(noSteps).path, [2])
})

Deno.test('validateSteps — 다른 갈래 변수를 쓰면 막는다', () => {
  const bad = structuredClone(SUB)
  bad[2].갈래[1].단계.push({ ...esd('x', 'y'), '보낼 정보': ['reservationDate'] })
  assertEquals(validateSteps(bad).path, [2, 1, 1])
})

Deno.test('integrationStepPath — n번째 연동(깊이 우선)의 경로', () => {
  assertEquals(integrationStepPath(SUB, 0), [1])
  assertEquals(integrationStepPath(SUB, 1), [2, 0, 2])
  assertEquals(integrationStepPath(SUB, 2), null)
})

Deno.test('branchStepCount — 갈래 단계 수(없으면 0)', () => {
  assertEquals(branchStepCount(SUB[2].갈래[0]), 3)
  assertEquals(branchStepCount({}), 0)
})

import { isStepValidatedField } from './steps.js'

Deno.test("isStepValidatedField — 단계가 있는 시나리오의 '분기'는 단계 검증이 맡는다(하위 흐름 갈래는 행동을 비워도 된다)", () => {
  assertEquals(isStepValidatedField('분기', { 단계: SUB }), true)
  assertEquals(isStepValidatedField('수집 정보', { 단계: SUB }), false)
  assertEquals(isStepValidatedField('분기', { 분기: [] }), false) // 단계 없는 예전 입력은 템플릿 필수 검증 그대로
})

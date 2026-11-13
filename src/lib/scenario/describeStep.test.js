import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { describeStep } from './describeStep.js'

Deno.test('describeStep — 유형별 한 줄 요약', () => {
  assertEquals(describeStep({ 유형: '정보 받기', 항목: [{ 항목명: '이름' }, { 항목명: '연락처' }] }), '정보 받기 · 이름, 연락처')
  assertEquals(describeStep({ 유형: '안내', 내용: '동의 안내' }), '안내 · 동의 안내')
  assertEquals(describeStep({ 유형: '연동', '연동 방식': '내부 데이터 저장·조회 (ESD)', '연동 목적': '회원 조회' }), '연동(ESD) · 회원 조회')
  assertEquals(
    describeStep({ 유형: '분기', 갈래: [
      { '조건 대상': '회원정보', 연산자: '있음', 값: '', '그 경우 봇의 행동': '회원 인사', 이후: '이어서 진행' },
      { '직접 입력 조건': '없음', '그 경우 봇의 행동': '비회원 안내', 이후: '여기서 종료' },
    ] }),
    '분기 · 회원정보 있음 → 회원 인사(이어서) / 없음 → 비회원 안내(종료)',
  )
  assertEquals(describeStep({ 유형: '연동', '연동 방식': '', '연동 목적': '조회' }), '연동 · 조회') // 방식 미선택이면 ESD로 단정하지 않는다
})

// ── 갈래 하위 흐름(2026-10-21) ──
import { describeFlow, describeBranchRow } from './describeStep.js'

const NESTED = { 유형: '분기', 갈래: [
  { '직접 입력 조건': '회원', '그 경우 봇의 행동': '', 이후: '이어서 진행', 단계: [{ 유형: '안내', 내용: '인사' }, { 유형: '정보 받기', 항목: [{ 항목명: '예약일' }] }] },
  { '직접 입력 조건': '비회원', '그 경우 봇의 행동': '가입 안내', 이후: '여기서 종료' },
] }

Deno.test('describeBranchRow — 하위 단계가 있으면 N단계, 없으면 한 줄 행동', () => {
  assertEquals(describeBranchRow(NESTED.갈래[0]), '회원 → 2단계(이어서)')
  assertEquals(describeBranchRow(NESTED.갈래[1]), '비회원 → 가입 안내(종료)')
  assertEquals(describeStep(NESTED), '분기 · 회원 → 2단계(이어서) / 비회원 → 가입 안내(종료)')
})

Deno.test('describeFlow — 갈래 하위 단계를 들여쓴 번호 목록으로 편다', () => {
  assertEquals(describeFlow([{ 유형: '안내', 내용: '시작' }, NESTED]), [
    { depth: 0, label: '1.', text: '안내 · 시작' },
    { depth: 0, label: '2.', text: '분기 · 회원 → 2단계(이어서) / 비회원 → 가입 안내(종료)' },
    { depth: 1, label: '갈래 1', text: '회원 (이어서)' },
    { depth: 2, label: '1.', text: '안내 · 인사' },
    { depth: 2, label: '2.', text: '정보 받기 · 예약일' },
  ])
})

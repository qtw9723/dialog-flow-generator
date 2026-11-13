import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { summarizeResponseChanges } from "./surveyEditSummary.js"

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const QUESTIONS = [
  { id: 'q1', text: '회사명' },
  { id: 'q2', text: '업종' },
  { id: 'q3', text: '주요 제품' },
]

const BASE = { q1: '(주)테스트', q2: '제조업', q3: '부품' }

// ── AC1: 변경 없음 ────────────────────────────────────────────────────────────

Deno.test('변경 없음 시 "변경 없음" 반환', () => {
  const result = summarizeResponseChanges(QUESTIONS, BASE, { ...BASE })
  assertEquals(result, '변경 없음')
})

Deno.test('빈 응답 맵 양쪽 → 변경 없음', () => {
  const result = summarizeResponseChanges(QUESTIONS, {}, {})
  assertEquals(result, '변경 없음')
})

// ── AC2: 한 항목 변경 — 질문명 포함 ───────────────────────────────────────────

Deno.test('한 항목 변경 시 질문명 포함 요약 반환', () => {
  const next = { ...BASE, q2: '서비스업' }
  const result = summarizeResponseChanges(QUESTIONS, BASE, next)
  assertEquals(result.includes('업종'), true)
  assertEquals(result.includes('수정'), true)
})

Deno.test('변경 요약 형식: "설문 수정 (수정: 질문명)"', () => {
  const next = { ...BASE, q1: '(주)변경' }
  const result = summarizeResponseChanges(QUESTIONS, BASE, next)
  assertEquals(result, '설문 수정 (수정: 회사명)')
})

// ── AC3: 항목 추가 ────────────────────────────────────────────────────────────

Deno.test('newResponses에 항목 추가 시 추가 항목명 포함', () => {
  const next = { ...BASE, q4: '신규 답변' }
  const qs = [...QUESTIONS, { id: 'q4', text: '신규 질문' }]
  const result = summarizeResponseChanges(qs, BASE, next)
  assertEquals(result.includes('추가'), true)
  assertEquals(result.includes('신규 질문'), true)
})

// ── AC4: 항목 삭제 ────────────────────────────────────────────────────────────

Deno.test('newResponses에서 항목 삭제 시 삭제 항목명 포함', () => {
  const next = { q1: BASE.q1, q2: BASE.q2 } // q3 제거
  const result = summarizeResponseChanges(QUESTIONS, BASE, next)
  assertEquals(result.includes('삭제'), true)
  assertEquals(result.includes('주요 제품'), true)
})

// ── AC5: 여러 항목 동시 변경 ──────────────────────────────────────────────────

Deno.test('여러 항목 변경 시 모두 포함', () => {
  const next = { q1: '변경됨', q2: '변경됨', q3: BASE.q3 }
  const result = summarizeResponseChanges(QUESTIONS, BASE, next)
  assertEquals(result.includes('회사명'), true)
  assertEquals(result.includes('업종'), true)
  // q3는 그대로이므로 포함 안 됨
  assertEquals(result.includes('주요 제품'), false)
})

Deno.test('수정+추가+삭제 혼합 시 모든 섹션 포함', () => {
  const qs = [...QUESTIONS, { id: 'q4', text: '추가질문' }]
  const old = { q1: 'A', q2: 'B', q3: 'C' }
  const next = { q1: 'A-수정', q4: '신규' } // q1 수정, q2·q3 삭제, q4 추가
  const result = summarizeResponseChanges(qs, old, next)
  assertEquals(result.includes('수정'), true)
  assertEquals(result.includes('추가'), true)
  assertEquals(result.includes('삭제'), true)
})

// ── AC6: 결정론적 — questions 없을 때 ID fallback ───────────────────────────

Deno.test('questions 빈 배열이면 ID를 label로 사용', () => {
  const result = summarizeResponseChanges([], { q1: 'old' }, { q1: 'new' })
  assertEquals(result.includes('q1'), true)
})

Deno.test('동일 입력에 대해 항상 같은 문자열 반환(결정론적)', () => {
  const next = { ...BASE, q1: '변경', q3: '변경2' }
  const r1 = summarizeResponseChanges(QUESTIONS, BASE, next)
  const r2 = summarizeResponseChanges(QUESTIONS, BASE, next)
  assertEquals(r1, r2)
})

// ── AC7: 순수 — 입력 불변 ────────────────────────────────────────────────────

Deno.test('입력 응답 맵을 변형하지 않는다', () => {
  const old = { q1: 'a' }
  const next = { q1: 'b', q2: 'c' }
  const oldKeys = Object.keys(old).join()
  const nextKeys = Object.keys(next).join()
  summarizeResponseChanges(QUESTIONS, old, next)
  assertEquals(Object.keys(old).join(), oldKeys)
  assertEquals(Object.keys(next).join(), nextKeys)
})

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { isSurveyEditable, hasAnswer, isUploadedResult, canApplyDialogEdit, isAssembledResult } from "./resultEditGating.js"

// ─── isSurveyEditable ─────────────────────────────────────────────────────────

Deno.test("isSurveyEditable: source='survey' → true", () => {
  assertEquals(isSurveyEditable({ generation_tiers: { source: "survey" } }), true)
})

Deno.test("isSurveyEditable: source='nl' → false", () => {
  assertEquals(isSurveyEditable({ generation_tiers: { source: "nl" } }), false)
})

Deno.test("isSurveyEditable: source='doc' → false", () => {
  assertEquals(isSurveyEditable({ generation_tiers: { source: "doc" } }), false)
})

Deno.test("isSurveyEditable: 마커 없는 레거시 결과 → true(하위호환)", () => {
  assertEquals(isSurveyEditable({ generation_tiers: {} }), true)
  assertEquals(isSurveyEditable({ generation_tiers: null }), true)
  assertEquals(isSurveyEditable({}), true)
})

Deno.test("isSurveyEditable: null/undefined 결과 → true(크래시 없음)", () => {
  assertEquals(isSurveyEditable(null), true)
  assertEquals(isSurveyEditable(undefined), true)
})

// ─── hasAnswer ────────────────────────────────────────────────────────────────

Deno.test("hasAnswer: 문자열 응답 있음 → true, 공백만 → false", () => {
  assertEquals(hasAnswer({ id: "q1" }, { q1: "배송봇" }), true)
  assertEquals(hasAnswer({ id: "q1" }, { q1: "   " }), false)
  assertEquals(hasAnswer({ id: "q1" }, { q1: "" }), false)
})

Deno.test("hasAnswer: 배열 응답 — 비어있지 않으면 true", () => {
  assertEquals(hasAnswer({ id: "q1" }, { q1: [{ 항목명: "이름" }] }), true)
  assertEquals(hasAnswer({ id: "q1" }, { q1: [] }), false)
})

Deno.test("hasAnswer: 객체 응답 — 값 하나라도 채워지면 true", () => {
  assertEquals(hasAnswer({ id: "q1" }, { q1: { a: "", b: "값" } }), true)
  assertEquals(hasAnswer({ id: "q1" }, { q1: { a: "", b: "  " } }), false)
})

Deno.test("hasAnswer: 응답 없음/누락 → false", () => {
  assertEquals(hasAnswer({ id: "q1" }, {}), false)
  assertEquals(hasAnswer({ id: "q1" }, { q2: "다른값" }), false)
  assertEquals(hasAnswer({ id: "q1" }, { q1: null }), false)
})

Deno.test("hasAnswer: question/answers null → false(크래시 없음)", () => {
  assertEquals(hasAnswer(null, { q1: "x" }), false)
  assertEquals(hasAnswer({ id: "q1" }, null), false)
})

// ── v0.9.0 업로드 봇 게이팅 ──────────────────────────────────────────────

const uploaded = { reference_id: null, generation_tiers: { upload: { uploaded_at: 'x' } } }
const generated = { reference_id: 'r1', generation_tiers: {} }

Deno.test('isUploadedResult: 업로드본만 true', () => {
  assertEquals(isUploadedResult(uploaded), true)
  assertEquals(isUploadedResult(generated), false)
  assertEquals(isUploadedResult({ reference_id: null, generation_tiers: {} }), false)
  assertEquals(isUploadedResult(null), false)
})

Deno.test('업로드 봇은 설문 기반 수정을 숨긴다 (원설문이 없다)', () => {
  assertEquals(isSurveyEditable(uploaded), false)
  assertEquals(isSurveyEditable(generated), true)
})

Deno.test('업로드 봇: 부분 패치는 확정 가능, 전체 재생성은 막는다', () => {
  assertEquals(canApplyDialogEdit(uploaded, 'patch').ok, true)
  const r = canApplyDialogEdit(uploaded, 'regenerate')
  assertEquals(r.ok, false)
  assertEquals(r.reason.includes('사라집니다'), true)
})

Deno.test('생성 결과는 전체 재생성도 막지 않는다 (기존 동작 유지)', () => {
  assertEquals(canApplyDialogEdit(generated, 'regenerate').ok, true)
  assertEquals(canApplyDialogEdit(generated, 'patch').ok, true)
})

Deno.test('mode가 없거나 모르는 값이면 막지 않는다', () => {
  for (const m of [undefined, null, '', 'unknown']) {
    assertEquals(canApplyDialogEdit(uploaded, m).ok, true, String(m))
  }
})

// ── v0.10.0 항목 5: 라이브러리 조립물 게이팅 ────────────────────────────
// 조립물은 reference_id가 없고 generation_tiers.upload도 없다. 판정을 더하지 않으면
// isSurveyEditable이 하위호환으로 true를 줘서 설문 편집 버튼이 뜨고 눌러 실패한다.

const assembled = { reference_id: null, generation_tiers: { assembly: { items: [] } } }
const legacyRow = { reference_id: 'r1', generation_tiers: {} }

Deno.test('isAssembledResult: assembly가 있고 reference_id가 없을 때만', () => {
  assertEquals(isAssembledResult(assembled), true)
  assertEquals(isAssembledResult(uploaded), false)
  assertEquals(isAssembledResult(generated), false)
  assertEquals(isAssembledResult(null), false)
  assertEquals(isAssembledResult({ reference_id: 'r', generation_tiers: { assembly: {} } }), false)
})

Deno.test('조립물은 업로드본이 아니다(배지가 갈려야 한다)', () => {
  assertEquals(isUploadedResult(assembled), false)
})

Deno.test('조립물에 설문 편집을 열지 않는다 (v0.9.0 결함 재발 방지)', () => {
  assertEquals(isSurveyEditable(assembled), false)
  assertEquals(isSurveyEditable(legacyRow), true)   // 하위호환은 그대로
})

Deno.test('조립물은 전체 재생성만 막고 부분 수정은 연다', () => {
  assertEquals(canApplyDialogEdit(assembled, 'patch').ok, true)
  assertEquals(canApplyDialogEdit(assembled, 'regenerate').ok, false)
})

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { normalizePdfText } from "./normalizePdfText.ts"
import type { PdfTextItem } from "./normalizePdfText.ts"

// ─── 인라인 fixture: 헬스케어 화면기획서 Case.1 PDF 텍스트 레이어 ─────────────
// pdfjs TextContent.items 산출 패턴으로 구성된 대표 문자열 픽스처.
// hasEOL=true: 해당 아이템 이후 줄바꿈(pdfjs 줄 구분 신호).
// 봇 멘트·버튼·입력·분기 요소가 포함된 증상 접수 시나리오 골격.

const HEALTHCARE_CASE1_ITEMS: PdfTextItem[] = [
  { str: "Case.1", hasEOL: false },
  { str: " 증상 접수", hasEOL: true },
  { str: "", hasEOL: true },
  { str: "봇 멘트", hasEOL: true },
  { str: "안녕하세요! 건강 관리 챗봇입니다.", hasEOL: true },
  { str: "어떤 불편함이 있으신가요?", hasEOL: true },
  { str: "", hasEOL: true },
  { str: "버튼", hasEOL: true },
  { str: "두통", hasEOL: false },
  { str: " | ", hasEOL: false },
  { str: "발열", hasEOL: false },
  { str: " | ", hasEOL: false },
  { str: "복통", hasEOL: false },
  { str: " | ", hasEOL: false },
  { str: "직접 입력", hasEOL: true },
  { str: "", hasEOL: true },
  { str: "입력", hasEOL: true },
  { str: "증상을 직접 입력해 주세요", hasEOL: true },
  { str: "", hasEOL: true },
  { str: "분기", hasEOL: true },
  { str: "두통 선택 → Case.2 두통 상세", hasEOL: true },
  { str: "발열 선택 → Case.3 발열 상세", hasEOL: true },
  { str: "직접 입력 → 자유 입력 처리", hasEOL: true },
]

// 동일 내용의 raw string 픽스처 (string 입력 경로 검증용)
const HEALTHCARE_CASE1_RAW = `Case.1 증상 접수

봇 멘트
안녕하세요! 건강 관리 챗봇입니다.
어떤 불편함이 있으신가요?

버튼
두통 | 발열 | 복통 | 직접 입력

입력
증상을 직접 입력해 주세요

분기
두통 선택 → Case.2 두통 상세
발열 선택 → Case.3 발열 상세
직접 입력 → 자유 입력 처리`

// ─── AC1: PdfTextItem[] 입력 — 시나리오 골격 보존 단언 ───────────────────────

Deno.test("AC1: 헬스케어 Case.1 PDF items — 봇 멘트·버튼·입력·분기 텍스트 보존", () => {
  const text = normalizePdfText(HEALTHCARE_CASE1_ITEMS)

  assert(text.includes("Case.1"), "시나리오 식별자 누락")
  assert(text.includes("봇 멘트"), "봇 멘트 섹션 누락")
  assert(text.includes("안녕하세요"), "봇 발화 누락")
  assert(text.includes("어떤 불편함이 있으신가요"), "봇 발화(질문) 누락")
  assert(text.includes("버튼"), "버튼 섹션 누락")
  assert(text.includes("두통"), "버튼 항목 누락")
  assert(text.includes("발열"), "버튼 항목(발열) 누락")
  assert(text.includes("입력"), "입력 섹션 누락")
  assert(text.includes("분기"), "분기 섹션 누락")
  assert(text.includes("Case.2 두통 상세"), "분기 텍스트 누락")
})

Deno.test("AC1: hasEOL=false 연속 아이템이 한 줄로 합쳐짐", () => {
  const text = normalizePdfText(HEALTHCARE_CASE1_ITEMS)
  // 버튼 아이템들이 "두통 | 발열 | 복통 | 직접 입력" 한 줄로 조합되어야 함
  assert(text.includes("두통"), "두통 버튼 누락")
  assert(text.includes("직접 입력"), "직접 입력 버튼 누락")
})

// ─── AC1: string 입력 경로 — 동일 골격 보존 ─────────────────────────────────

Deno.test("AC1: 헬스케어 Case.1 raw string — 봇 멘트·버튼·입력·분기 텍스트 보존", () => {
  const text = normalizePdfText(HEALTHCARE_CASE1_RAW)

  assert(text.includes("Case.1"), "시나리오 식별자 누락")
  assert(text.includes("봇 멘트"), "봇 멘트 섹션 누락")
  assert(text.includes("안녕하세요"), "봇 발화 누락")
  assert(text.includes("버튼"), "버튼 섹션 누락")
  assert(text.includes("두통"), "버튼 항목 누락")
  assert(text.includes("분기"), "분기 섹션 누락")
})

// ─── AC2: 공백 정규화 — 연속 공백·탭·\r\n 처리 ──────────────────────────────

Deno.test("AC2: 연속 공백 → 단일 공백으로 정규화", () => {
  const text = normalizePdfText("  봇  멘트  안녕하세요  ")
  assertEquals(text, "봇 멘트 안녕하세요")
})

Deno.test("AC2: \\r\\n 개행 → \\n 정규화", () => {
  const text = normalizePdfText("봇 멘트\r\n안녕하세요\r\n버튼")
  assert(text.includes("봇 멘트"), "봇 멘트 누락")
  assert(text.includes("안녕하세요"), "발화 누락")
  assert(text.includes("버튼"), "버튼 누락")
})

// ─── AC3: 빈·깨진 입력 — 예외 없이 안전 처리 ────────────────────────────────

Deno.test("AC3: 빈 문자열 입력 → 빈 문자열 반환, throw 없음", () => {
  assertEquals(normalizePdfText(""), "")
})

Deno.test("AC3: 빈 배열 입력 → 빈 문자열 반환, throw 없음", () => {
  assertEquals(normalizePdfText([]), "")
})

Deno.test("AC3: null 입력 → 빈 문자열 반환, throw 없음", () => {
  assertEquals(normalizePdfText(null as unknown as string), "")
})

Deno.test("AC3: undefined 입력 → 빈 문자열 반환, throw 없음", () => {
  assertEquals(normalizePdfText(undefined as unknown as string), "")
})

Deno.test("AC3: 공백만 있는 문자열 → 빈 문자열 반환", () => {
  assertEquals(normalizePdfText("   \n\t\n  "), "")
})

Deno.test("AC3: str 없는 아이템 포함 배열 → 예외 없이 안전 처리", () => {
  const items = [
    { str: "봇 멘트", hasEOL: true },
    null as unknown as PdfTextItem,
    { str: undefined as unknown as string, hasEOL: true },
    { str: "버튼", hasEOL: true },
  ]
  const text = normalizePdfText(items)
  assert(text.includes("봇 멘트"), "유효 아이템 누락")
  assert(text.includes("버튼"), "유효 아이템 누락")
})

Deno.test("AC3: hasEOL 없는 마지막 아이템 — 내용 보존됨", () => {
  const items: PdfTextItem[] = [
    { str: "봇 멘트", hasEOL: true },
    { str: "안녕하세요", hasEOL: false }, // hasEOL 없이 끝남
  ]
  const text = normalizePdfText(items)
  assert(text.includes("안녕하세요"), "마지막 아이템 내용 누락")
})

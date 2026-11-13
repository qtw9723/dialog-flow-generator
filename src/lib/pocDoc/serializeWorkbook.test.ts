import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { serializeWorkbook } from "./serializeWorkbook.ts"

// ─── 인라인 fixture: 레스토랑 #1. Usecase ────────────────────────────────────
// 실제 xlsx 시트 구조(xlsx.utils.sheet_to_json 또는 aoa 산출 기준) 표현.
// 열: 순번 | 시나리오 | 질의 | 응답 | 화면 구성 | ESD | API | 비고

const RESTAURANT_USECASE_ROWS: string[][] = [
  ["순번", "시나리오", "질의", "응답", "화면 구성", "ESD", "API", "비고"],
  ["1", "메뉴 안내", "메뉴가 뭐예요?", "저희 메뉴를 안내해 드릴게요.", "메뉴 목록 화면", "", "", ""],
  ["2", "예약하기", "예약하고 싶어요", "날짜와 인원을 알려주세요.", "예약 폼", "예약_ESD", "예약_API", ""],
  ["3", "주문하기", "주문할게요", "무엇을 주문하시겠어요?", "주문 화면", "", "주문_API", ""],
]

// ─── 인라인 fixture: 헬스케어 시나리오 정리 ──────────────────────────────────
// 열: No | Group Name | Depth1 | Depth2 | 구분 | 시나리오 | 연동 | In/out | Comment | 발화 예시 | Intent | Entity

const HEALTHCARE_SCENARIO_ROWS: string[][] = [
  ["No", "Group Name", "Depth1", "Depth2", "구분", "시나리오", "연동", "In/out", "Comment", "발화 예시", "Intent", "Entity"],
  ["1", "예약", "신규 예약", "", "Main", "신규 예약 안내", "", "out", "", "예약하고 싶어요", "예약_인텐트", "날짜, 시간"],
  ["2", "예약", "신규 예약", "날짜 선택", "Sub", "날짜를 선택해 주세요", "", "out", "", "", "", "날짜"],
  ["3", "조회", "예약 조회", "", "Main", "예약 조회 안내", "", "out", "", "예약 확인하고 싶어요", "조회_인텐트", ""],
]

// ─── 인라인 fixture: 헬스케어 Case.2 신규 예약 ───────────────────────────────
// 열: Step | 시나리오 | 화면 | 기능 | 연동 | API 명 | Request Data | Respond Data | 비고

const HEALTHCARE_CASE2_ROWS: string[][] = [
  ["Step", "시나리오", "화면", "기능", "연동", "API 명", "Request Data", "Respond Data", "비고"],
  ["1", "신규 예약", "예약 화면", "날짜 선택", "", "", "", "날짜 선택 화면 표시", ""],
  ["2", "신규 예약", "예약 화면", "시간 선택", "", "", "날짜", "시간 선택 화면 표시", ""],
  ["3", "신규 예약", "예약 확인", "예약 완료 처리", "예약 시스템", "예약_API", "날짜, 시간", "예약 완료 안내", ""],
]

// ─── AC1: 레스토랑 #1.Usecase — 시나리오 골격 보존 ──────────────────────────

Deno.test("AC1: 레스토랑 #1.Usecase — 시트 헤더 + 시나리오명·질의·응답 보존", () => {
  const sheets = [{ name: "#1. Usecase", rows: RESTAURANT_USECASE_ROWS }]
  const text = serializeWorkbook(sheets)

  assert(text.includes("=== #1. Usecase ==="), "시트 헤더 누락")
  assert(text.includes("메뉴 안내"), "시나리오명 누락")
  assert(text.includes("메뉴가 뭐예요?"), "질의(발화) 누락")
  assert(text.includes("저희 메뉴를 안내해 드릴게요."), "응답(완료 내용) 누락")
  assert(text.includes("예약하기"), "두 번째 시나리오명 누락")
  assert(text.includes("예약하고 싶어요"), "두 번째 질의 누락")
  assert(text.includes("주문하기"), "세 번째 시나리오명 누락")
})

// ─── AC2: 헬스케어 시나리오 정리 — 시나리오명·발화 보존 ─────────────────────

Deno.test("AC2: 헬스케어 시나리오 정리 — 시트 헤더 + 시나리오·발화 예시 보존", () => {
  const sheets = [{ name: "시나리오 정리", rows: HEALTHCARE_SCENARIO_ROWS }]
  const text = serializeWorkbook(sheets)

  assert(text.includes("=== 시나리오 정리 ==="), "시트 헤더 누락")
  assert(text.includes("신규 예약 안내"), "시나리오 누락")
  assert(text.includes("예약하고 싶어요"), "발화 예시 누락")
  assert(text.includes("예약 조회 안내"), "조회 시나리오 누락")
  assert(text.includes("예약 확인하고 싶어요"), "조회 발화 예시 누락")
  assert(text.includes("날짜, 시간"), "Entity(수집) 정보 누락")
})

// ─── AC3: 헬스케어 Case.2 — 시나리오명·완료 내용 보존 ───────────────────────

Deno.test("AC3: 헬스케어 Case.2 — 시트 헤더 + 시나리오·완료 내용(Respond Data) 보존", () => {
  const sheets = [{ name: "Case.2 신규 예약", rows: HEALTHCARE_CASE2_ROWS }]
  const text = serializeWorkbook(sheets)

  assert(text.includes("=== Case.2 신규 예약 ==="), "시트 헤더 누락")
  assert(text.includes("신규 예약"), "시나리오명 누락")
  assert(text.includes("예약 완료 안내"), "완료 내용(Respond Data) 누락")
  assert(text.includes("날짜 선택 화면 표시"), "Step 1 Respond Data 누락")
  assert(text.includes("날짜, 시간"), "Request Data(수집) 정보 누락")
})

// ─── AC4: 멀티시트 — 레스토랑+헬스케어 모두 직렬화됨 ───────────────────────

Deno.test("AC4: 멀티시트 workbook — 두 시트 모두 포함됨", () => {
  const sheets = [
    { name: "#1. Usecase", rows: RESTAURANT_USECASE_ROWS },
    { name: "시나리오 정리", rows: HEALTHCARE_SCENARIO_ROWS },
    { name: "Case.2 신규 예약", rows: HEALTHCARE_CASE2_ROWS },
  ]
  const text = serializeWorkbook(sheets)

  assert(text.includes("=== #1. Usecase ==="))
  assert(text.includes("=== 시나리오 정리 ==="))
  assert(text.includes("=== Case.2 신규 예약 ==="))
  // 시트 간 이중 개행 구분
  assert(text.includes("\n\n"), "시트 간 빈 줄 구분 누락")
})

// ─── AC5: 빈 셀 — 빈값 유지(탭 위치 보존), 날조 없음 ───────────────────────

Deno.test("AC5: 빈 셀 — 탭으로 위치 보존, 날조 없음", () => {
  const sheets = [{ name: "테스트", rows: [["A", "B", "C"], ["1", "", "3"]] }]
  const text = serializeWorkbook(sheets)

  // 빈 셀 B는 탭 사이 빈 문자열로 → "1\t\t3"
  assert(text.includes("1\t\t3"), `빈 셀이 탭 위치로 보존되어야 함, 실제: ${text}`)
})

Deno.test("AC5: 헤더 행 빈 셀도 탭 위치 보존", () => {
  const sheets = [{ name: "시트", rows: [["가", "", "나"], ["1", "2", "3"]] }]
  const text = serializeWorkbook(sheets)
  assert(text.includes("가\t\t나"))
})

// ─── AC6: 빈 시트 — 출력에서 생략됨 ────────────────────────────────────────

Deno.test("AC6: 빈 시트(rows 없음) — 출력에서 생략", () => {
  const sheets = [
    { name: "빈 시트", rows: [] },
    { name: "내용 있는 시트", rows: [["A", "B"]] },
  ]
  const text = serializeWorkbook(sheets)
  assert(!text.includes("=== 빈 시트 ==="), "빈 시트가 출력에 포함됨")
  assert(text.includes("=== 내용 있는 시트 ==="), "내용 시트 누락")
})

Deno.test("AC6: 모든 셀이 공백인 시트 — 출력에서 생략", () => {
  const sheets = [{ name: "공백만", rows: [["", " "], ["  ", ""]] }]
  const text = serializeWorkbook(sheets)
  assertEquals(text, "")
})

// ─── AC7: 불규칙 열수 — 예외 없이 처리됨 ───────────────────────────────────

Deno.test("AC7: 불규칙 열수(행마다 열 수 다름) — 예외 없이 직렬화됨", () => {
  const sheets = [{
    name: "불규칙",
    rows: [
      ["A", "B", "C"],
      ["1"],
      ["X", "Y", "Z", "W"],
    ],
  }]
  const text = serializeWorkbook(sheets)
  assert(text.includes("A"))
  assert(text.includes("1"))
  assert(text.includes("W"))
})

// ─── AC8: 빈 입력 — 예외 없이 빈 문자열 반환 ───────────────────────────────

Deno.test("AC8: 빈 배열 입력 → 빈 문자열 반환", () => {
  assertEquals(serializeWorkbook([]), "")
})

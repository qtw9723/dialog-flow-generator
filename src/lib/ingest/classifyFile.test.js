import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { classifyFile } from "./classifyFile.js"

// ── fixtures ──────────────────────────────────────────────────────────────────

const ESD_XLSX_TEXT =
  "예약번호\t고객명\t수량\t금액\n" +
  "R1\t홍길동\t1\t10000\n" +
  "R2\t이순신\t2\t20000\n"

const OPENAPI_JSON_TEXT = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "테스트 API", version: "1.0.0" },
  paths: { "/orders": { get: { summary: "주문 목록" } } },
})

const OPENAPI_YAML_TEXT =
  "openapi: 3.0.1\n" +
  "info:\n  title: 주문 API\n  version: '1'\n" +
  "paths:\n  /orders:\n    get:\n      summary: 주문 목록 조회\n"

const SCENARIO_PDF_TEXT =
  "시나리오 정의서\n" +
  "1단계: 고객이 상품을 선택한다.\n" +
  "2단계: 시스템이 재고를 확인한다.\n" +
  "3단계: 결제가 완료되면 주문이 확정된다.\n"

// 엑셀이지만 헤더 + 데이터행 1개뿐 → 격자형 확정 불가
const AMBIGUOUS_XLSX_TEXT =
  "유스케이스 ID\t유스케이스 명\t행위자\n" +
  "UC-001\t예약 등록\t고객\n"

// ── tests ─────────────────────────────────────────────────────────────────────

Deno.test("classifyFile: 엑셀 데이터표(격자형, 헤더+반복행) → 'esd'", () => {
  const result = classifyFile("ESD_data.xlsx", ESD_XLSX_TEXT)
  assertEquals(result.kind, "esd")
})

Deno.test("classifyFile: OpenAPI JSON fixture → 'api'", () => {
  const result = classifyFile("api_spec.json", OPENAPI_JSON_TEXT)
  assertEquals(result.kind, "api")
})

Deno.test("classifyFile: OpenAPI YAML fixture → 'api'", () => {
  const result = classifyFile("api_spec.yaml", OPENAPI_YAML_TEXT)
  assertEquals(result.kind, "api")
})

Deno.test("classifyFile: 서술형 PDF-추출 텍스트 fixture → 'scenario'", () => {
  const result = classifyFile("scenario.pdf", SCENARIO_PDF_TEXT)
  assertEquals(result.kind, "scenario")
})

Deno.test("classifyFile: 모호 엑셀(usecase 표, 데이터행 1개) fixture → 'ambiguous'", () => {
  const result = classifyFile("usecase.xlsx", AMBIGUOUS_XLSX_TEXT)
  assertEquals(result.kind, "ambiguous")
})

Deno.test("classifyFile: reason 필드가 비어 있지 않음", () => {
  const kinds = [
    classifyFile("data.xlsx", ESD_XLSX_TEXT),
    classifyFile("api.json", OPENAPI_JSON_TEXT),
    classifyFile("doc.pdf", SCENARIO_PDF_TEXT),
    classifyFile("uc.xlsx", AMBIGUOUS_XLSX_TEXT),
  ]
  for (const r of kinds) {
    assertEquals(typeof r.reason, "string")
    assertEquals(r.reason.length > 0, true)
  }
})

Deno.test("classifyFile: .md 확장자 → 'scenario'", () => {
  assertEquals(classifyFile("readme.md", "# 개요\n설명 텍스트").kind, "scenario")
})

Deno.test("classifyFile: .txt 확장자 → 'scenario'", () => {
  assertEquals(classifyFile("notes.txt", "일반 텍스트 내용입니다.").kind, "scenario")
})

Deno.test("classifyFile: .csv 데이터표 → 'esd'", () => {
  const csv = "id,name,amount\n1,A,100\n2,B,200\n"
  assertEquals(classifyFile("data.csv", csv).kind, "esd")
})

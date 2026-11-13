import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { classifyFiles } from "./classifyFiles.js"

// ── fixtures (classifyFile.test.js와 동일 텍스트) ─────────────────────────────

const FILES = [
  {
    name: "ESD_data.xlsx",
    textContent:
      "예약번호\t고객명\t수량\t금액\n" +
      "R1\t홍길동\t1\t10000\n" +
      "R2\t이순신\t2\t20000\n",
  },
  {
    name: "api_spec.json",
    textContent: JSON.stringify({
      openapi: "3.0.0",
      info: { title: "테스트 API", version: "1.0.0" },
      paths: { "/orders": { get: { summary: "주문 목록" } } },
    }),
  },
  {
    name: "api_spec.yaml",
    textContent:
      "openapi: 3.0.1\n" +
      "info:\n  title: 주문 API\n  version: '1'\n" +
      "paths:\n  /orders:\n    get:\n      summary: 주문 목록 조회\n",
  },
  {
    name: "scenario.pdf",
    textContent:
      "시나리오 정의서\n" +
      "1단계: 고객이 상품을 선택한다.\n" +
      "2단계: 시스템이 재고를 확인한다.\n",
  },
  {
    name: "usecase.xlsx",
    textContent:
      "유스케이스 ID\t유스케이스 명\t행위자\n" +
      "UC-001\t예약 등록\t고객\n",
  },
]

// ── tests ─────────────────────────────────────────────────────────────────────

Deno.test("classifyFiles: 혼합 뭉치 — 각 항목 kind 정확", () => {
  const { files } = classifyFiles(FILES)
  assertEquals(files[0].kind, "esd")
  assertEquals(files[1].kind, "api")
  assertEquals(files[2].kind, "api")
  assertEquals(files[3].kind, "scenario")
  assertEquals(files[4].kind, "ambiguous")
})

Deno.test("classifyFiles: 혼합 뭉치 — counts 집계 정확", () => {
  const { counts } = classifyFiles(FILES)
  assertEquals(counts.esd, 1)
  assertEquals(counts.api, 2)
  assertEquals(counts.scenario, 1)
  assertEquals(counts.ambiguous, 1)
})

Deno.test("classifyFiles: 결과 files 배열이 name 필드를 유지함", () => {
  const { files } = classifyFiles(FILES)
  assertEquals(files.map((f) => f.name), FILES.map((f) => f.name))
})

Deno.test("classifyFiles: 빈 배열 → files 빈, counts 전부 0", () => {
  const { files, counts } = classifyFiles([])
  assertEquals(files, [])
  assertEquals(counts, { esd: 0, api: 0, scenario: 0, ambiguous: 0 })
})

Deno.test("classifyFiles: 단일 ESD 파일 → counts.esd = 1", () => {
  const { counts } = classifyFiles([
    {
      name: "single.csv",
      textContent: "col1,col2,col3\nA,B,C\nD,E,F\n",
    },
  ])
  assertEquals(counts.esd, 1)
  assertEquals(counts.api + counts.scenario + counts.ambiguous, 0)
})

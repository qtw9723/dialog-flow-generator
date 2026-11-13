import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { routeApiDoc } from "./routeApiDoc.js"

Deno.test("routeApiDoc: OpenAPI JSON 루트 → 'openapi'", () => {
  const json = JSON.stringify({ openapi: "3.0.0", paths: { "/users": {} } })
  assertEquals(routeApiDoc(json), "openapi")
})

Deno.test("routeApiDoc: OpenAPI YAML 접두 → 'openapi'", () => {
  const yaml = "openapi: 3.0.1\npaths:\n  /items:\n    get:\n      summary: 목록 조회"
  assertEquals(routeApiDoc(yaml), "openapi")
})

Deno.test("routeApiDoc: swagger YAML 접두 → 'openapi'", () => {
  const yaml = 'swagger: "2.0"\ninfo:\n  title: 테스트'
  assertEquals(routeApiDoc(yaml), "openapi")
})

Deno.test("routeApiDoc: 자유/서술형 API 문서 텍스트 → 'freeform'", () => {
  const text =
    "주문 조회 API\nGET /orders/{id}\n응답: 주문 상세 정보를 JSON으로 반환합니다."
  assertEquals(routeApiDoc(text), "freeform")
})

Deno.test("routeApiDoc: 빈 문자열/공백 → 'freeform'", () => {
  assertEquals(routeApiDoc(""), "freeform")
  assertEquals(routeApiDoc("   "), "freeform")
})

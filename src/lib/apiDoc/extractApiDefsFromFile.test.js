import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { extractApiDefsFromFile } from "./extractApiDefsFromFile.js"

// ── fixtures ──────────────────────────────────────────────────────────────────

const OPENAPI_JSON_TEXT = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "주문 API", version: "1.0.0" },
  paths: {
    "/orders": { get: { operationId: "listOrders", summary: "주문 목록" } },
  },
})

const OPENAPI_YAML_TEXT =
  "openapi: 3.0.1\n" +
  "info:\n  title: 주문 API\n  version: '1'\n" +
  "paths:\n  /orders:\n    get:\n      operationId: listOrders\n      summary: 주문 목록 조회\n"

const FREEFORM_TEXT =
  "주문 조회 API\nGET /orders/{id}\n응답: 주문 상세 정보를 JSON으로 반환합니다."

const MOCK_LLM_DEFS = [{ operationId: "listOrders", method: "GET", path: "/orders" }]

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFile(name, content) {
  return { name, _content: content }
}

function makeExtractText(textOrError) {
  return async (_file) => {
    if (textOrError instanceof Error) throw textOrError
    return textOrError
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

Deno.test("extractApiDefsFromFile: OpenAPI 텍스트 → 결정론 defs, source=openapi, callApiDocParse 미호출", async () => {
  let callCount = 0
  const callApiDocParse = async (_text) => {
    callCount++
    return { defs: MOCK_LLM_DEFS }
  }
  const extractText = makeExtractText(OPENAPI_JSON_TEXT)

  const result = await extractApiDefsFromFile(makeFile("api.json", ""), { callApiDocParse, extractText })

  assertEquals(result.source, "openapi")
  assertEquals(result.error, null)
  assertEquals(Array.isArray(result.defs), true)
  assertEquals(result.defs.length > 0, true)
  assertEquals(callCount, 0) // LLM 미호출
})

Deno.test("extractApiDefsFromFile: OpenAPI YAML 텍스트 → 결정론 defs, source=openapi, callApiDocParse 미호출", async () => {
  let callCount = 0
  const callApiDocParse = async (_text) => {
    callCount++
    return { defs: MOCK_LLM_DEFS }
  }
  const extractText = makeExtractText(OPENAPI_YAML_TEXT)

  const result = await extractApiDefsFromFile(makeFile("api.yaml", ""), { callApiDocParse, extractText })

  assertEquals(result.source, "openapi")
  assertEquals(result.error, null)
  assertEquals(Array.isArray(result.defs), true)
  assertEquals(result.defs.length > 0, true)
  assertEquals(callCount, 0) // LLM 미호출
})

Deno.test("extractApiDefsFromFile: freeform 텍스트 → callApiDocParse 1회 호출, source=llm, mock defs 반영", async () => {
  let callCount = 0
  const callApiDocParse = async (_text) => {
    callCount++
    return { defs: MOCK_LLM_DEFS }
  }
  const extractText = makeExtractText(FREEFORM_TEXT)

  const result = await extractApiDefsFromFile(makeFile("api.txt", ""), { callApiDocParse, extractText })

  assertEquals(result.source, "llm")
  assertEquals(result.error, null)
  assertEquals(result.defs, MOCK_LLM_DEFS)
  assertEquals(callCount, 1)
})

Deno.test("extractApiDefsFromFile: extractText throw → error 세팅, defs=[], source=null", async () => {
  const callApiDocParse = async (_text) => ({ defs: MOCK_LLM_DEFS })
  const extractText = makeExtractText(new Error("파일을 읽을 수 없습니다."))

  const result = await extractApiDefsFromFile(makeFile("bad.pdf", ""), { callApiDocParse, extractText })

  assertEquals(result.defs, [])
  assertEquals(result.source, null)
  assertEquals(typeof result.error, "string")
  assertEquals(result.error.length > 0, true)
})

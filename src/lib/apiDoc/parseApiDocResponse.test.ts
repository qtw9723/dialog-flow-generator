import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildApiExtractionPrompt, normalizeApiDefs } from "./parseApiDocResponse.ts"

const SKELETON_KEYS = [
  "name", "description", "method", "contentType", "content",
  "headers", "params", "result", "url", "authType", "authParams",
].sort()

Deno.test("normalizeApiDefs: 여러 API 배열을 골격 스키마로 정규화", () => {
  const raw = JSON.stringify([
    { name: "getUser", method: "get", url: "https://api.x.com/users/${id}", params: [{ name: "id", desc: "사용자 ID" }] },
    { name: "createOrder", method: "post", url: "https://api.x.com/orders", contentType: "json", content: [{ key: "item", value: "" }] },
  ])
  const defs = normalizeApiDefs(raw)
  assertEquals(defs.length, 2)
  assertEquals(Object.keys(defs[0]).sort(), SKELETON_KEYS)
  assertEquals(defs[0].method, "GET")
  assertEquals(defs[1].method, "POST")
  assertEquals(defs[1].contentType, "json")
  assertEquals(defs[0].params[0], { name: "id", desc: "사용자 ID" })
  assertEquals(defs[0].authType, "noAuth")
})

Deno.test("normalizeApiDefs: 코드펜스로 감싼 응답도 파싱", () => {
  const raw = '```json\n[{"name":"ping","method":"GET","url":"/ping"}]\n```'
  const defs = normalizeApiDefs(raw)
  assertEquals(defs.length, 1)
  assertEquals(defs[0].name, "ping")
})

Deno.test("normalizeApiDefs: 앞뒤 잡텍스트 사이의 배열만 복구", () => {
  const raw = '다음이 결과입니다:\n[{"name":"a","method":"GET","url":"/a"}]\n확인하세요.'
  const defs = normalizeApiDefs(raw)
  assertEquals(defs.length, 1)
  assertEquals(defs[0].name, "a")
})

Deno.test("normalizeApiDefs: 파싱 불가·비배열은 빈 배열", () => {
  assertEquals(normalizeApiDefs("그냥 설명 문장"), [])
  assertEquals(normalizeApiDefs(""), [])
})

Deno.test("normalizeApiDefs: 잘못된 method/contentType은 기본값으로 강제", () => {
  const defs = normalizeApiDefs(JSON.stringify([{ name: "x", method: "FETCH", contentType: "xml", url: "/x" }]))
  assertEquals(defs[0].method, "GET")
  assertEquals(defs[0].contentType, "query")
})

Deno.test("buildApiExtractionPrompt: 문서 텍스트를 프롬프트에 포함", () => {
  const p = buildApiExtractionPrompt("주문 조회 API")
  assertEquals(p.includes("주문 조회 API"), true)
  assertEquals(p.includes("JSON"), true)
})

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { substitute, buildRequest } from "./buildRequest.ts"

Deno.test("substitute: ${변수}를 값으로, 없으면 원형 유지", () => {
  assertEquals(substitute("http://x/${pid}", { pid: "123" }), "http://x/123")
  assertEquals(substitute("Bearer ${tok}", {}), "Bearer ${tok}")
})

Deno.test("buildRequest: GET — url 치환 + content는 쿼리스트링, 바디 없음", () => {
  const r = buildRequest(
    { url: "http://x/${pid}", method: "get", contentType: "query", headers: [{ key: "Authorization", value: "Bearer ${tok}" }], content: [{ key: "q", value: "1" }] },
    { pid: "p9", tok: "abc" },
  )
  assertEquals(r.method, "GET")
  assertEquals(r.url, "http://x/p9?q=1")
  assertEquals(r.headers.Authorization, "Bearer abc")
  assertEquals(r.body, undefined)
})

Deno.test("buildRequest: POST json — content를 JSON 바디로 + Content-Type 자동", () => {
  const r = buildRequest(
    { url: "http://x", method: "post", contentType: "json", headers: [], content: [{ key: "name", value: "${name}" }] },
    { name: "홍길동" },
  )
  assertEquals(r.method, "POST")
  assertEquals(r.body, JSON.stringify({ name: "홍길동" }))
  assertEquals(r.headers["Content-Type"], "application/json")
})

Deno.test("buildRequest: POST form — urlencoded 바디", () => {
  const r = buildRequest(
    { url: "http://x", method: "post", contentType: "form", headers: [], content: [{ key: "grant_type", value: "password" }] },
    {},
  )
  assertEquals(r.body, "grant_type=password")
  assertEquals(r.headers["Content-Type"], "application/x-www-form-urlencoded")
})

Deno.test("buildRequest: POST rawBody — 중첩 JSON 그대로 바디로 + ${변수} 치환", () => {
  const r = buildRequest(
    { url: "http://x", method: "post", contentType: "json", headers: [], content: [], rawBody: '{"a":{"b":"${v}"},"c":1}' },
    { v: "9" },
  )
  assertEquals(r.body, '{"a":{"b":"9"},"c":1}')
  assertEquals(r.headers["Content-Type"], "application/json")
})

Deno.test("buildRequest: rawBody는 content보다 우선", () => {
  const r = buildRequest(
    { url: "http://x", method: "post", headers: [], content: [{ key: "x", value: "1" }], rawBody: '{"y":2}' },
    {},
  )
  assertEquals(r.body, '{"y":2}')
})

Deno.test("buildRequest: GET이면 rawBody 무시(쿼리만)", () => {
  const r = buildRequest(
    { url: "http://x", method: "get", headers: [], content: [{ key: "q", value: "1" }], rawBody: '{"y":2}' },
    {},
  )
  assertEquals(r.url, "http://x?q=1")
  assertEquals(r.body, undefined)
})

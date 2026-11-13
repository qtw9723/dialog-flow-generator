import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { collectEsdFields, deriveEsdSchemas } from "./deriveEsdSchemas.ts"

const json = () => ({
  dialogs: [{
    id: "main",
    nodes: [
      { id: "w", type: "greeting" },
      { id: "e1", type: "esd", config: { type: "create", query: { schemaName: "reservation", where: null, data: { name: "local.name", phone: "local.phone", inquiry: "context.inquiry" } } } },
      { id: "e2", type: "esd", config: { type: "findone", query: { schemaName: "reservation", where: [{ field: "name", value: "local.name", expression: "eq" }, { field: "bookNo", value: "context.bookNo", expression: "eq" }] } } },
    ],
  }],
})

Deno.test("collectEsdFields: create data + where field 합집합(중복 제거)", () => {
  const f = collectEsdFields(json())
  assertEquals(f.reservation, ["name", "phone", "inquiry", "bookNo"])  // name 중복 제거
})

Deno.test("collectEsdFields: schemaName은 config.query.schemaName에서 읽는다(실생성 구조)", () => {
  // 레퍼런스 템플릿 잔재(빈 값 필드)는 제외, 바인딩된 필드만 수집
  const j = { dialogs: [{ id: "main", nodes: [
    { id: "e", type: "esd", config: { type: "create", query: { schemaName: "상담기록",
      data: { no: "", cart: "", name: "", 문의내용: "local.inquiry" } } } },
  ]}]}
  assertEquals(collectEsdFields(j), { "상담기록": ["문의내용"] })
})

Deno.test("collectEsdFields: 구버전 config.schemaName도 폴백 지원", () => {
  const j = { dialogs: [{ id: "main", nodes: [
    { id: "e", type: "esd", config: { schemaName: "s", query: { data: { a: "x" } } } },
  ]}]}
  assertEquals(collectEsdFields(j), { s: ["a"] })
})

Deno.test("collectEsdFields: esd 없으면 빈 객체", () => {
  assertEquals(collectEsdFields({ dialogs: [{ id: "main", nodes: [{ id: "w", type: "greeting" }] }] }), {})
})

Deno.test("deriveEsdSchemas: LLM 추론 적용 (type/crypt/key)", async () => {
  const mock = async (_p: string) =>
    '{"name":{"type":"string","crypt":"true","key":false},"phone":{"type":"string","crypt":"true","key":false},"inquiry":{"type":"string","crypt":"false","key":false},"bookNo":{"type":"string","crypt":"false","key":true}}'
  const schemas = await deriveEsdSchemas(json(), mock, "2026-06-19T00:00:00.000Z")
  assertEquals(schemas.length, 1)
  const s = schemas[0]
  assertEquals(s.name, "reservation")
  assertEquals(s.createdBy, "DialogFlow Generator")
  assertEquals(s.criteriaField, "updatedAt")
  const byName = Object.fromEntries(s.fields.map((f) => [f.name, f]))
  assertEquals(byName.name.crypt, "true")        // 개인정보 암호화
  assertEquals(byName.phone.crypt, "true")
  assertEquals(byName.bookNo.key, true)          // 식별자 key
  assertEquals(byName.inquiry.crypt, "false")
  assertEquals(s.fields.every((f) => f.readOnly === false && f.useSearch === false), true)
})

Deno.test("deriveEsdSchemas: LLM 실패/빈 응답 → 전부 string 폴백(필드 보존)", async () => {
  const schemas = await deriveEsdSchemas(json(), async () => { throw new Error("down") }, "t")
  assertEquals(schemas[0].fields.map((f) => f.name), ["name", "phone", "inquiry", "bookNo"])
  assertEquals(schemas[0].fields.every((f) => f.type === "string" && f.crypt === "false" && f.key === false), true)
})

Deno.test("deriveEsdSchemas: 잘못된 type은 string으로 정정", async () => {
  const mock = async () => '{"name":{"type":"weird","crypt":"nope","key":1}}'
  const schemas = await deriveEsdSchemas({ dialogs: [{ id: "main", nodes: [
    { id: "e", type: "esd", config: { query: { schemaName: "s", data: { name: "x" } } } },
  ]}]}, mock, "t")
  assertEquals(schemas[0].fields[0].type, "string")   // weird → string
  assertEquals(schemas[0].fields[0].crypt, "false")   // nope → false
  assertEquals(schemas[0].fields[0].key, false)       // 1 → false (true만 인정)
})

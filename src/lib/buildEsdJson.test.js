import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildEsdJson } from "./buildEsdJson.js"
import { buildEsdSchema } from "./buildEsdSchema.js"
import { apiDocToDef } from "./apiDocToDef.js"

const MINIMAL_OPENAPI = {
  openapi: "3.0.0",
  info: { title: "Test", version: "1" },
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/items/{id}": {
      get: {
        operationId: "getItem",
        summary: "Get item",
        parameters: [{ name: "id", in: "path", description: "아이템 ID" }],
      },
    },
  },
}

const ENTITY_INPUT = {
  schemaName: "주문",
  fields: [
    { name: "orderId", type: "string", key: true, crypt: "false" },
    { name: "customerName", type: "string", key: false, crypt: "true" },
    { name: "amount", type: "number", key: false, crypt: false },
  ],
  createdAt: "2026-07-29T00:00:00.000Z",
}

// AC5: entities[i] 키셋이 buildEsdSchema 직접 호출 산출과 일치
Deno.test("AC5: entities 키셋이 buildEsdSchema 직접 호출 결과와 동일", () => {
  const result = buildEsdJson({ entities: [ENTITY_INPUT], apis: [] })
  const direct = buildEsdSchema({
    schemaName: ENTITY_INPUT.schemaName,
    headers: ENTITY_INPUT.fields.map((f) => f.name),
    fieldSpecs: Object.fromEntries(
      ENTITY_INPUT.fields.map((f) => [f.name, { type: f.type, key: f.key, crypt: f.crypt }])
    ),
    createdAt: ENTITY_INPUT.createdAt,
  })
  assertEquals(Object.keys(result.entities[0]), Object.keys(direct))
  assertEquals(Object.keys(result.entities[0].fields[0]), Object.keys(direct.fields[0]))
})

// AC5: entities[i] 값이 buildEsdSchema 직접 호출 결과와 동일(드리프트 없음)
Deno.test("AC5: entities 값이 buildEsdSchema 직접 호출 결과와 정확히 일치", () => {
  const result = buildEsdJson({ entities: [ENTITY_INPUT], apis: [] })
  const direct = buildEsdSchema({
    schemaName: ENTITY_INPUT.schemaName,
    headers: ENTITY_INPUT.fields.map((f) => f.name),
    fieldSpecs: Object.fromEntries(
      ENTITY_INPUT.fields.map((f) => [f.name, { type: f.type, key: f.key, crypt: f.crypt }])
    ),
    createdAt: ENTITY_INPUT.createdAt,
  })
  assertEquals(result.entities[0], direct)
})

// AC5: apis[i] 키셋이 apiDocToDef 산출 api_def 키셋과 일치
Deno.test("AC5: apis 키셋이 apiDocToDef 산출 api_def 키셋과 일치", () => {
  const apiDefs = apiDocToDef(MINIMAL_OPENAPI)
  const result = buildEsdJson({ entities: [], apis: apiDefs })
  assertEquals(Object.keys(result.apis[0]).sort(), Object.keys(apiDefs[0]).sort())
})

// AC5: apis는 가공 없이 입력 그대로 통과
Deno.test("AC5: apis는 apiDocToDef 결과를 재조립 없이 그대로 전달", () => {
  const apiDefs = apiDocToDef(MINIMAL_OPENAPI)
  const result = buildEsdJson({ entities: [], apis: apiDefs })
  assertEquals(result.apis, apiDefs)
})

// AC6: 복합키(key:true 여러 필드) 정확 반영
Deno.test("AC6: 복합키 — 다중 key:true 필드가 모두 key=true로 반영됨", () => {
  const entity = {
    schemaName: "복합키엔티티",
    fields: [
      { name: "regionCode", type: "string", key: true, crypt: "false" },
      { name: "shopId", type: "string", key: true, crypt: "false" },
      { name: "description", type: "string", key: false, crypt: "false" },
    ],
    createdAt: "2026-07-29T00:00:00.000Z",
  }
  const result = buildEsdJson({ entities: [entity], apis: [] })
  const fields = result.entities[0].fields
  assertEquals(fields.map((f) => f.key), [true, true, false])
})

// AC6: crypt 토글 — boolean true → "true" 문자열
Deno.test("AC6: crypt boolean true → \"true\" 문자열로 정규화", () => {
  const entity = {
    schemaName: "암호화테스트",
    fields: [
      { name: "이름", type: "string", key: false, crypt: true },
      { name: "나이", type: "number", key: false, crypt: false },
    ],
    createdAt: "2026-07-29T00:00:00.000Z",
  }
  const result = buildEsdJson({ entities: [entity], apis: [] })
  assertEquals(result.entities[0].fields[0].crypt, "true")
  assertEquals(result.entities[0].fields[1].crypt, "false")
})

// AC6: crypt 토글 — 문자열 "true"/"false" 그대로 통과
Deno.test("AC6: crypt 문자열 \"true\"/\"false\" 입력 → 그대로 정규화", () => {
  const entity = {
    schemaName: "문자열암호화",
    fields: [
      { name: "email", type: "string", key: false, crypt: "true" },
      { name: "score", type: "number", key: false, crypt: "false" },
    ],
    createdAt: "2026-07-29T00:00:00.000Z",
  }
  const result = buildEsdJson({ entities: [entity], apis: [] })
  assertEquals(result.entities[0].fields[0].crypt, "true")
  assertEquals(result.entities[0].fields[1].crypt, "false")
})

// 기본 동작: 여러 엔티티 + API 혼합
Deno.test("여러 엔티티 + API 혼합 입력 → {entities, apis} 구조 정확", () => {
  const entities = [
    { schemaName: "A", fields: [{ name: "id", type: "string", key: true, crypt: "false" }], createdAt: "2026-07-29T00:00:00.000Z" },
    { schemaName: "B", fields: [{ name: "val", type: "number", key: false, crypt: "false" }], createdAt: "2026-07-29T00:00:00.000Z" },
  ]
  const apis = apiDocToDef(MINIMAL_OPENAPI)
  const result = buildEsdJson({ entities, apis })
  assertEquals(result.entities.length, 2)
  assertEquals(result.apis.length, apis.length)
  assertEquals(result.entities[0].name, "A")
  assertEquals(result.entities[1].name, "B")
})

// 빈 입력은 {entities: [], apis: []}
Deno.test("빈 입력 → {entities: [], apis: []}", () => {
  const result = buildEsdJson({ entities: [], apis: [] })
  assertEquals(result, { entities: [], apis: [] })
})

// createdAt 주입 순수성: 인자로 받은 createdAt이 그대로 전달됨
Deno.test("createdAt은 인자 주입값 그대로 entities에 반영 (new Date() 내부 호출 없음)", () => {
  const ts = "2024-01-15T12:30:00.000Z"
  const entity = { schemaName: "타임스탬프테스트", fields: [{ name: "col", type: "string", key: false, crypt: "false" }], createdAt: ts }
  const result = buildEsdJson({ entities: [entity], apis: [] })
  assertEquals(result.entities[0].createdAt, ts)
})

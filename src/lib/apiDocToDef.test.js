import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { apiDocToDef } from "./apiDocToDef.js"

// skeletonApiDef 필드 집합 source of truth (deriveApiDefs.ts 기준)
const SKELETON_KEYS = [
  "name", "description", "method", "contentType", "content",
  "headers", "params", "result", "url", "authType", "authParams",
].sort()

// ── AC1: GET + 경로 파라미터 fixture 정확 일치 ──────────────────

Deno.test("AC1: GET /members/{id} → getMember fixture 정확 일치", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/members/{id}": {
        get: {
          operationId: "getMember",
          summary: "회원 조회",
          parameters: [{ name: "id", in: "path", description: "회원ID" }],
        },
      },
    },
  }

  const defs = apiDocToDef(doc)
  assertEquals(defs.length, 1)
  assertEquals(defs[0], {
    name: "getMember",
    description: "회원 조회",
    method: "GET",
    contentType: "query",
    content: [],
    headers: [],
    params: [{ name: "id", desc: "회원ID" }],
    result: { type: "json", _error: "", _result: "" },
    url: "https://api.x.com/members/${id}",
    authType: "noAuth",
    authParams: {},
  })
})

// ── AC2: requestBody contentType ────────────────────────────────

Deno.test("AC2: POST requestBody application/json → contentType json + content KV", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/members": {
        post: {
          operationId: "createMember",
          summary: "회원 생성",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    email: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  }

  const defs = apiDocToDef(doc)
  assertEquals(defs.length, 1)
  assertEquals(defs[0].contentType, "json")
  assertEquals(defs[0].content, [
    { key: "name", value: "" },
    { key: "email", value: "" },
  ])
})

Deno.test("AC2: POST requestBody form-urlencoded → contentType form", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/upload": {
        post: {
          operationId: "uploadFile",
          requestBody: {
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  properties: { file: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  }

  const defs = apiDocToDef(doc)
  assertEquals(defs[0].contentType, "form")
  assertEquals(defs[0].content, [{ key: "file", value: "" }])
})

// ── AC3: 다중 엔드포인트 ────────────────────────────────────────

Deno.test("AC3: 같은 path 여러 method + 여러 path → 각각 별도 api_def", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/members": {
        get: { operationId: "listMembers", summary: "회원 목록" },
        post: { operationId: "createMember", summary: "회원 생성" },
      },
      "/orders": {
        get: { operationId: "listOrders", summary: "주문 목록" },
      },
    },
  }

  const defs = apiDocToDef(doc)
  assertEquals(defs.length, 3)
  const names = defs.map((d) => d.name).sort()
  assertEquals(names, ["createMember", "listMembers", "listOrders"])
  assertEquals(defs.find((d) => d.name === "listMembers").method, "GET")
  assertEquals(defs.find((d) => d.name === "createMember").method, "POST")
})

// ── AC4: 경로 파라미터 vs 쿼리 파라미터 ────────────────────────

Deno.test("AC4: 경로 파라미터 → params + url ${param} 유지, content 미포함", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/orders/{orderId}": {
        get: {
          operationId: "getOrder",
          parameters: [
            { name: "orderId", in: "path", description: "주문ID" },
          ],
        },
      },
    },
  }

  const def = apiDocToDef(doc)[0]
  assertEquals(def.url, "https://api.x.com/orders/${orderId}")
  assertEquals(def.params, [{ name: "orderId", desc: "주문ID" }])
  assertEquals(def.content, [])
})

Deno.test("AC4: 쿼리 파라미터 → params + content 양쪽 포함", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/search": {
        get: {
          operationId: "search",
          parameters: [
            { name: "q", in: "query", description: "검색어" },
            { name: "page", in: "query", description: "페이지" },
          ],
        },
      },
    },
  }

  const def = apiDocToDef(doc)[0]
  assertEquals(def.params, [
    { name: "q", desc: "검색어" },
    { name: "page", desc: "페이지" },
  ])
  assertEquals(def.content, [
    { key: "q", value: "" },
    { key: "page", value: "" },
  ])
})

Deno.test("AC4: 경로+쿼리 혼합 → 경로는 params·url만, 쿼리는 params+content", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/items/{id}/search": {
        get: {
          operationId: "searchItems",
          parameters: [
            { name: "id", in: "path", description: "카테고리ID" },
            { name: "keyword", in: "query", description: "검색어" },
          ],
        },
      },
    },
  }

  const def = apiDocToDef(doc)[0]
  assertEquals(def.url, "https://api.x.com/items/${id}/search")
  assertEquals(def.params, [
    { name: "id", desc: "카테고리ID" },
    { name: "keyword", desc: "검색어" },
  ])
  assertEquals(def.content, [{ key: "keyword", value: "" }])
})

// ── AC5: 산출 필드 집합 == skeletonApiDef ───────────────────────

Deno.test("AC5: 산출 객체 필드 집합 == skeletonApiDef(추가/누락 없음)", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/test": { get: { operationId: "testEndpoint" } },
    },
  }

  const defs = apiDocToDef(doc)
  assertEquals(defs.length, 1)
  assertEquals(Object.keys(defs[0]).sort(), SKELETON_KEYS)
})

Deno.test("AC5: POST/PUT도 skeletonApiDef 필드 집합 동일(rawBody 추가 없음)", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/items": {
        post: {
          operationId: "createItem",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { name: { type: "string" } } },
              },
            },
          },
        },
        put: { operationId: "replaceItem" },
      },
    },
  }

  for (const def of apiDocToDef(doc)) {
    assertEquals(Object.keys(def).sort(), SKELETON_KEYS)
  }
})

// ── AC6: OpenAPI 아님/빈 paths → [] ─────────────────────────────

Deno.test("AC6: null/undefined 입력 → 빈 배열", () => {
  assertEquals(apiDocToDef(null), [])
  assertEquals(apiDocToDef(undefined), [])
})

Deno.test("AC6: paths 없음 → 빈 배열", () => {
  assertEquals(apiDocToDef({}), [])
  assertEquals(apiDocToDef({ info: { title: "test" } }), [])
})

Deno.test("AC6: 빈 paths → 빈 배열", () => {
  assertEquals(apiDocToDef({ openapi: "3.0.0", paths: {} }), [])
})

// ── 추가: operationId 없을 때 name 후보 생성 ────────────────────

Deno.test("operationId 없으면 method+path 기반 slug로 name 생성", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/members": {
        get: { summary: "회원 목록" },
      },
    },
  }

  const def = apiDocToDef(doc)[0]
  assertEquals(typeof def.name, "string")
  assertEquals(def.name.length > 0, true)
})

// ── 추가: summary 없으면 description 폴백 ──────────────────────

Deno.test("summary 없고 description 있으면 description → description 필드", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/test": {
        get: {
          operationId: "testOp",
          description: "테스트 상세 설명",
        },
      },
    },
  }

  assertEquals(apiDocToDef(doc)[0].description, "테스트 상세 설명")
})

// ── 추가: servers 없을 때 url = path만 ─────────────────────────

Deno.test("servers 없으면 url = path(baseUrl 빈 문자열)", () => {
  const doc = {
    openapi: "3.0.0",
    paths: {
      "/items/{id}": {
        get: { operationId: "getItem" },
      },
    },
  }

  assertEquals(apiDocToDef(doc)[0].url, "/items/${id}")
})

// ── 추가: example 값이 있으면 content value에 반영 ─────────────

Deno.test("schema property example 있으면 content value에 반영", () => {
  const doc = {
    openapi: "3.0.0",
    servers: [{ url: "https://api.x.com" }],
    paths: {
      "/members": {
        post: {
          operationId: "createMember",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    age: { type: "integer", example: 30 },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  }

  const content = apiDocToDef(doc)[0].content
  assertEquals(content.find((c) => c.key === "age").value, "30")
  assertEquals(content.find((c) => c.key === "name").value, "")
})

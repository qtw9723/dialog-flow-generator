import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { collectApiUsage, deriveApiDefs, draftApiDef, skeletonApiDef, applyApiNames, bindApiParams } from "./deriveApiDefs.ts"

Deno.test("collectApiUsage: API 항목만, 선택/직접(엔드포인트·헤더·바디) 분리, ESD 무시", () => {
  const responses = { q: [{ "외부 연동": [
    { "연동 방식": "외부 시스템 호출 (API)", "사용할 API": ["openEMR_patient"] },
    { "연동 방식": "외부 시스템 호출 (API)", "엔드포인트 URL": "http://x/${pid}", method: "GET", "연동 목적": "조회",
      "헤더": [{ key: "Authorization", value: "Bearer ${tok}" }], "바디": [], "보낼 정보": ["pid"] },
    { "연동 방식": "내부 데이터 저장·조회 (ESD)" },
  ] }] }
  const u = collectApiUsage(responses)
  assertEquals(u.refNames, ["openEMR_patient"])
  assertEquals(u.directs.length, 1)
  assertEquals(u.directs[0].method, "get")
  assertEquals(u.directs[0].url, "http://x/${pid}")
  assertEquals(u.directs[0].headers, [{ key: "Authorization", value: "Bearer ${tok}" }])
})

Deno.test("skeletonApiDef: 입력 헤더/바디 보존 + ${변수}→params", () => {
  const g = skeletonApiDef({ url: "http://x/${pid}", method: "get", purpose: "조회", send: [], receive: [],
    headers: [{ key: "Authorization", value: "Bearer ${tok}" }], body: [], paramHint: "" })
  assertEquals(g.contentType, "query")
  assertEquals(g.content, [])
  assertEquals(g.headers, [{ key: "Authorization", value: "Bearer ${tok}" }])
  assertEquals(g.params.map((p: any) => p.name).sort(), ["pid", "tok"])
  const p = skeletonApiDef({ url: "u", method: "post", purpose: "등록", send: [], receive: [],
    headers: [], body: [{ key: "name", value: "${name}" }], paramHint: "" })
  assertEquals(p.contentType, "json")
  assertEquals(p.content, [{ key: "name", value: "${name}" }])
  assertEquals(p.params.map((x: any) => x.name), ["name"])
})

Deno.test("collectApiUsage: 쿼리 파라미터(파라미터)·JSON 바디(rawBody) 수집", () => {
  const responses = { q: [{ "외부 연동": [
    { "연동 방식": "외부 시스템 호출 (API)", "엔드포인트 URL": "http://x", method: "GET", "연동 목적": "조회",
      "파라미터": [{ key: "pid", value: "${환자ID}" }] },
    { "연동 방식": "외부 시스템 호출 (API)", "엔드포인트 URL": "http://y", method: "POST", "연동 목적": "등록",
      "바디 형식": "json", "바디 JSON": '{"name":"${이름}"}' },
  ] }] }
  const u = collectApiUsage(responses)
  assertEquals(u.directs[0].query, [{ key: "pid", value: "${환자ID}" }])
  assertEquals(u.directs[1].rawBody, '{"name":"${이름}"}')
})

Deno.test("collectApiUsage: 직접입력 'API 이름'(name) 보존", () => {
  const responses = { q: [{ "외부 연동": [
    { "연동 방식": "외부 시스템 호출 (API)", "사용할 API": "새로 입력", "API 이름": "getPatient",
      "엔드포인트 URL": "http://x/${pid}", method: "GET", "연동 목적": "조회" },
  ] }] }
  const u = collectApiUsage(responses)
  assertEquals(u.directs.length, 1)
  assertEquals(u.directs[0].name, "getPatient")
})

Deno.test("skeletonApiDef: 입력 name이 있으면 그대로, 없으면 slug(목적/URL)", () => {
  const withName = skeletonApiDef({ name: "getPatient", url: "http://x", method: "get", purpose: "조회",
    send: [], receive: [], headers: [], body: [], paramHint: "" })
  assertEquals(withName.name, "getPatient")
  const noName = skeletonApiDef({ url: "http://x", method: "get", purpose: "환자 조회",
    send: [], receive: [], headers: [], body: [], paramHint: "" })
  assertEquals(noName.name, "환자_조회")
})

Deno.test("draftApiDef: 입력 name은 LLM이 못 바꾸게 보존", async () => {
  const def = await draftApiDef(
    { name: "getPatient", url: "http://x", method: "get", purpose: "조회", send: [], receive: [], headers: [], body: [], paramHint: "" },
    async () => '{"name":"somethingElse","method":"get","url":"http://x","authType":"noAuth"}',
  )
  assertEquals(def.name, "getPatient")
})

Deno.test("skeletonApiDef: 쿼리 파라미터→content + ${변수}→params", () => {
  const g = skeletonApiDef({ url: "http://x", method: "get", purpose: "조회", send: [], receive: [],
    headers: [], body: [], query: [{ key: "pid", value: "${환자ID}" }], rawBody: "", paramHint: "" })
  assertEquals(g.contentType, "query")
  assertEquals(g.content, [{ key: "pid", value: "${환자ID}" }])
  assertEquals(g.params.map((p: any) => p.name), ["환자ID"])
})

Deno.test("skeletonApiDef: JSON 바디(rawBody) 보존 + content best-effort + ${변수}→params", () => {
  const p = skeletonApiDef({ url: "http://y", method: "post", purpose: "등록", send: [], receive: [],
    headers: [], body: [], query: [], rawBody: '{"name":"${이름}","age":30}', paramHint: "" })
  assertEquals(p.contentType, "json")
  assertEquals(p.rawBody, '{"name":"${이름}","age":30}')
  assertEquals(p.content, [{ key: "name", value: "${이름}" }, { key: "age", value: "30" }])
  assertEquals(p.params.map((x: any) => x.name), ["이름"])
})

Deno.test("draftApiDef: LLM 실패 시 충실 스켈레톤 폴백", async () => {
  const def = await draftApiDef({ url: "u", method: "get", purpose: "조회", send: [], receive: [], headers: [], body: [], paramHint: "" }, async () => "not json")
  assertEquals(def.url, "u")
  assertEquals(def.authType, "noAuth")
})

Deno.test("deriveApiDefs: 라이브러리 def(이름매칭) + 직접입력 초안, name 중복 제거", async () => {
  const responses = { q: [{ "외부 연동": [
    { "연동 방식": "외부 시스템 호출 (API)", "사용할 API": ["libA"] },
    { "연동 방식": "외부 시스템 호출 (API)", url: "http://d", method: "get", "연동 목적": "직접" },
  ] }] }
  const libRows = [{ name: "libA", api_def: { name: "libA", method: "get", url: "http://lib" } }]
  const defs = await deriveApiDefs(responses, libRows, async () => '{"name":"directApi","method":"get","url":"http://d","authType":"noAuth"}')
  assertEquals(defs.map((d) => d.name), ["libA", "directApi"])
  assertEquals(defs[0].url, "http://lib")
})

Deno.test("collectApiUsage: 자동매칭 없음 — 직접입력 없으면 directs 비고 paramHint 수집", () => {
  const responses = { q: [{ "시나리오 이름": "예약", "외부 연동": [
    { "연동 방식": "외부 시스템 호출 (API)", "엔드포인트 URL": "http://x/${pid}", method: "GET", "파라미터 설명": "pid에 환자ID를 보낸다" },
  ] }] }
  const u = collectApiUsage(responses)
  assertEquals(u.directs.length, 1)
  assertEquals(u.directs[0].paramHint, "pid에 환자ID를 보낸다")
})

Deno.test("bindApiParams: LLM 매핑으로 api 노드 config.params 채움(수집변수→param)", async () => {
  const gj: any = { dialogs: [{ id: "main", nodes: [
    { id: "s1", type: "set", config: { items: [{ key: "local.patientId", value: "input.text" }] } },
    { id: "a1", type: "api", config: { apiName: "getPatient" } },
  ] }] }
  const defs = [{ name: "getPatient", params: [{ name: "pid", desc: "" }] }]
  const responses = { q: [{ "외부 연동": [{ "연동 방식": "외부 시스템 호출 (API)", "엔드포인트 URL": "http://x/${pid}", method: "get", "파라미터 설명": "pid는 환자ID" }] }] }
  const n = await bindApiParams(gj, defs, responses, async () => '{"getPatient":{"pid":"local.patientId"}}')
  assertEquals(n, 1)
  assertEquals(gj.dialogs[0].nodes[1].config.params, [{ key: "pid", value: "local.patientId" }])
})

Deno.test("applyApiNames: api 노드 config.apiName을 def name으로 채움", () => {
  const gj: any = { dialogs: [{ id: "main", nodes: [
    { id: "n1", type: "api", config: {} },
    { id: "n2", type: "output" },
  ] }] }
  const n = applyApiNames(gj, [{ name: "openEMR_patient" }])
  assertEquals(n, 1)
  assertEquals(gj.dialogs[0].nodes[0].config.apiName, "openEMR_patient")
})

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { parsePatches, applyFillPatches, fillNodeValues, FILLABLE_TYPES, collectVariables, availableVarsByNode, buildOutputPrompt, buildConfigPrompt, buildConditionPrompt, buildApiReceiveFields, sanitizePlaceholders, loopControlVars } from "./fillValues.ts"

const sampleJson = (): any => ({
  dialogs: [{
    id: "main",
    nodes: [
      { id: "n1", type: "greeting", label: "환영", condition: "_greeting" },
      { id: "n2", type: "set", label: "이름·전화 수집", condition: "" },
      { id: "n3", type: "esd", label: "예약 저장", config: { type: "findone", query: { where: "{몽고}" }, schemaName: "테스트" }, condition: "" },
      { id: "n4", type: "output", label: "완료 안내", config: { items: [{ text: [{ texts: ["완료 안내"] }], type: "text" }], waitInput: false } },
      { id: "n5", type: "node", label: "조회 분기", condition: "" },
    ],
  }],
})

Deno.test("parsePatches: 순수 JSON", () => {
  assertEquals(parsePatches('{"n2":{"condition":"x"}}'), { n2: { condition: "x" } })
})

Deno.test("parsePatches: ```json 펜스 + 잡텍스트 허용", () => {
  const raw = "여기 결과입니다:\n```json\n{\"n2\": {\"condition\": \"y\"}}\n```\n끝."
  assertEquals(parsePatches(raw), { n2: { condition: "y" } })
})

Deno.test("parsePatches: 잘못된 JSON → 빈 객체", () => {
  assertEquals(parsePatches("그냥 텍스트"), {})
  assertEquals(parsePatches('{"broken": '), {})
  assertEquals(parsePatches("[1,2,3]"), {})   // 배열은 패치 아님
})

Deno.test("applyFillPatches: config/condition 적용 + config는 머지", () => {
  const json = sampleJson()
  const n = applyFillPatches(json, {
    n2: { config: { items: [{ key: "context.name", value: "_input", condition: "" }] } },
    n3: { config: { query: { where: "{name: context.name}" }, schemaName: "reservation" }, condition: "" },
    n5: { condition: "_result != null" },
  })
  assertEquals(n, 3)
  const nodes = json.dialogs[0].nodes
  assertEquals(nodes[1].config.items[0].key, "context.name")          // set config 추가
  assertEquals(nodes[2].config.schemaName, "reservation")             // esd 머지(교체)
  assertEquals(nodes[2].config.type, "findone")                       // 기존 config 필드 보존(머지)
  assertEquals(nodes[4].condition, "_result != null")                 // 분기 condition
})

Deno.test("applyFillPatches: 미지 nodeId·빈 패치 무시", () => {
  const json = sampleJson()
  const n = applyFillPatches(json, { nope: { condition: "z" }, n2: {} })
  assertEquals(n, 0)
})

Deno.test("applyFillPatches: 빈 label은 덮어쓰지 않음", () => {
  const json = sampleJson()
  applyFillPatches(json, { n2: { label: "   " } })
  assertEquals(json.dialogs[0].nodes[1].label, "이름·전화 수집")   // 유지
})

Deno.test("fillNodeValues: 대상 노드 0개면 LLM 호출 없이 skip", async () => {
  const json: any = { dialogs: [{ id: "main", nodes: [{ id: "n1", type: "greeting" }, { id: "n2", type: "group" }] }] }
  let called = false
  const res = await fillNodeValues(json, {}, async () => { called = true; return "{}" })
  assertEquals(res, { filled: 0, attempted: 0 })
  assertEquals(called, false)
})

Deno.test("fillNodeValues: mock LLM 패치 적용", async () => {
  const json = sampleJson()
  // n3(esd)=config 패스, n4(output)=메시지 패스
  const mock = async () => '{"n3":{"config":{"type":"insert","query":{"where":""},"schemaName":"reservation"}},"n4":{"message":"예약이 완료되었습니다"}}'
  const res = await fillNodeValues(json, { intent: {} }, mock)
  assertEquals(res.attempted, 4)   // set(n2)·esd(n3)·output(n4)·node(n5) = 4 (greeting 제외)
  assertEquals(json.dialogs[0].nodes[2].config.schemaName, "reservation")
  assertEquals(json.dialogs[0].nodes[3].config.items[0].text[0].texts[0], "예약이 완료되었습니다")
})

Deno.test("fillNodeValues: LLM이 던져도 throw 안 함(스켈레톤 폴백)", async () => {
  const json = sampleJson()
  const res = await fillNodeValues(json, {}, async () => { throw new Error("LLM down") })
  assertEquals(res.filled, 0)
  assertEquals(json.dialogs[0].nodes[2].config.schemaName, "테스트")   // 원본 유지
})

Deno.test("fillNodeValues: 분기 자식 condition을 조건 패스가 채운다", async () => {
  const json: any = { dialogs: [{ id: "main", nodes: [
    { id: "b1", type: "node", label: "조회 결과 분기", then: ["c1", "c2"], condition: "" },
    { id: "c1", type: "output", label: "조회 성공", config: { items: [] }, condition: "" },
    { id: "c2", type: "output", label: "조회 실패", config: { items: [] }, condition: "" },
  ]}]}
  // 조건 패스가 받는 분기 자식 조건(다른 패스는 이 JSON에서 적용할 게 없음)
  const mock = async (_p: string) => '{"c1":{"condition":"_result != null"},"c2":{"condition":"_result == null"}}'
  await fillNodeValues(json, {}, mock)
  assertEquals(json.dialogs[0].nodes[1].condition, "_result != null")  // 성공 갈래
  assertEquals(json.dialogs[0].nodes[2].condition, "_result == null")  // 실패 갈래
})

Deno.test("fillNodeValues: set config 비면 config 패스가 재시도해 채운다", async () => {
  const json: any = { dialogs: [{ id: "main", nodes: [
    { id: "s1", type: "set", label: "이름 저장" },
  ]}]}
  let calls = 0
  const mock = async (_p: string) => {
    calls++
    return calls < 2 ? "{}" : '{"s1":{"config":{"items":[{"key":"local.name","value":"input.text","condition":""}]}}}'
  }
  await fillNodeValues(json, {}, mock)
  assertEquals(json.dialogs[0].nodes[0].config.items[0].key, "local.name")   // 재시도로 채워짐
})

Deno.test("fillNodeValues: output 메시지 패스가 멘트를 채운다", async () => {
  const json: any = { dialogs: [{ id: "main", nodes: [
    { id: "n1", type: "output", label: "환영 인사와 안내", config: { items: [{ type: "text", text: [{ texts: ["환영 인사와 안내"] }] }] } },
  ]}]}
  const mock = async (_p: string) => '{"n1":{"message":"안녕하세요! 무엇을 도와드릴까요?"}}'
  await fillNodeValues(json, {}, mock)
  assertEquals(json.dialogs[0].nodes[0].config.items[0].text[0].texts[0], "안녕하세요! 무엇을 도와드릴까요?")
})

Deno.test("fillNodeValues: 값/분기 없으면 output 패스만 호출", async () => {
  // output 하나뿐 → config·conditions 패스 불필요. output 패스가 1회로 채우면 추가 호출 없음.
  const json: any = { dialogs: [{ id: "main", nodes: [
    { id: "n1", type: "output", label: "안내", config: { items: [{ type: "text", text: [{ texts: ["안내"] }] }] } },
  ]}]}
  let calls = 0
  await fillNodeValues(json, {}, async () => { calls++; return '{"n1":{"message":"안녕하세요"}}' })
  assertEquals(calls, 1)  // output 패스만 (config/conditions 스킵)
})

Deno.test("collectVariables: set=scalar, esd findone=object, findall=array, 스키마 필드 수집", () => {
  const nodes = [
    { id: "s1", type: "set", config: { items: [{ key: "local.name", value: "input.text" }, { key: "context.bookNo", value: "input.text" }] } },
    { id: "e1", type: "esd", config: { type: "create", schemaName: "reservation", query: { where: null, data: { name: "local.name", phone: "local.phone", inquiry: "context.inquiry" } }, result: [{ key: "local.reservation", value: "_result", condition: "" }] } },
    { id: "e2", type: "esd", config: { type: "findall", schemaName: "menu", query: { where: [{ field: "category", value: "local.cat", expression: "eq" }] }, result: [{ key: "local.menuList", value: "_result", condition: "" }] } },
  ]
  const vars = collectVariables(nodes)
  const byName = Object.fromEntries(vars.map((v) => [v.name, v]))
  assertEquals(byName["local.name"].kind, "scalar")
  assertEquals(byName["context.bookNo"].kind, "scalar")
  // create → object, 필드는 query.data 키
  assertEquals(byName["local.reservation"].kind, "object")
  assertEquals(byName["local.reservation"].fields?.sort(), ["inquiry", "name", "phone"])
  // findall → array
  assertEquals(byName["local.menuList"].kind, "array")
  // where 필드도 스키마 필드로 수집
  assertEquals(byName["local.menuList"].fields, ["category"])
})

Deno.test("collectVariables: api 결과(_result)는 object로 노출, '받을 정보' 필드 주입", () => {
  const nodes = [
    { id: "a1", type: "api", config: { apiName: "getWeather", params: [{ key: "city", value: "local.city" }], result: [{ key: "local.weatherInfo", value: "_result", condition: "" }] } },
    { id: "a2", type: "api", config: { apiName: "noFields", result: [{ key: "local.raw", value: "_result", condition: "" }] } },
  ]
  const vars = collectVariables(nodes, { getWeather: ["temp", "condition", "city"] })
  const byName = Object.fromEntries(vars.map((v) => [v.name, v]))
  assertEquals(byName["local.weatherInfo"].kind, "object")
  assertEquals(byName["local.weatherInfo"].fields, ["temp", "condition", "city"])
  assertEquals(byName["local.weatherInfo"].note, "api")
  // 받을 정보 없는 API도 object로 노출(필드만 미상)
  assertEquals(byName["local.raw"].kind, "object")
  assertEquals(byName["local.raw"].fields, [])
})

Deno.test("availableVarsByNode: api 결과 변수가 하류 output에 노출된다", () => {
  const nodes = [
    { id: "a1", type: "api", then: ["o1"], config: { apiName: "getWeather", result: [{ key: "local.weatherInfo", value: "_result", condition: "" }] } },
    { id: "o1", type: "output", then: [], config: {} },
  ]
  const map = availableVarsByNode(nodes, { getWeather: ["temp"] })
  const o1 = Object.fromEntries((map["o1"] || []).map((v: any) => [v.name, v]))
  assert(o1["local.weatherInfo"], "api 결과가 output에 보여야 함")
  assertEquals(o1["local.weatherInfo"].fields, ["temp"])
})

Deno.test("sanitizePlaceholders: ${var.한글placeholder}는 ${var}로, 영문 필드는 보존", () => {
  // 필드 미상일 때 새는 한글 placeholder 제거
  assertEquals(sanitizePlaceholders("현재 ${local.weatherResult.필드}입니다"), "현재 ${local.weatherResult}입니다")
  assertEquals(sanitizePlaceholders("${local.w.영문필드명}"), "${local.w}")
  // 영문 필드 참조는 그대로 유지
  assertEquals(sanitizePlaceholders("${local.weatherInfo.temp_C}도"), "${local.weatherInfo.temp_C}도")
  assertEquals(sanitizePlaceholders("${local.menus.join(', ')}"), "${local.menus.join(', ')}")
  // 한글 변수 단독(점 없음)은 건드리지 않음
  assertEquals(sanitizePlaceholders("${local.city}"), "${local.city}")
})

Deno.test("buildApiReceiveFields: 외부연동(API)의 'API 이름'→'받을 정보' 매핑", () => {
  const responses = {
    q: [{ "외부 연동": [
      { "연동 방식": "외부 시스템 호출 (API)", "API 이름": "getWeather", "받을 정보": ["temp", "humidity"] },
      { "연동 방식": "내부 데이터 저장·조회 (ESD)", "결과를 담을 이름": "예약결과" },  // ESD는 제외
      { "연동 방식": "외부 시스템 호출 (API)", "사용할 API": "memberLookup", "받을 정보": ["name", "grade"] },
    ] }],
  }
  const m = buildApiReceiveFields(responses)
  assertEquals(m["getWeather"], ["temp", "humidity"])
  assertEquals(m["memberLookup"], ["name", "grade"])  // 'API 이름' 없으면 '사용할 API'로 폴백
})

Deno.test("buildOutputPrompt: 노드별 사용가능 변수(앞 흐름 선언)·없는 변수 금지·객체/배열 명시", () => {
  const outputs = [{ id: "n9", label: "예약 완료 안내" }, { id: "n20", label: "메뉴 안내" }]
  const varsByNode = {
    n9: [
      { name: "local.name", kind: "scalar" as const },
      { name: "local.reservation", kind: "object" as const, fields: ["name", "phone", "bookNo"], note: "create" },
    ],
    n20: [
      { name: "local.menuList", kind: "array" as const, fields: ["name", "price"], note: "findall" },
    ],
  }
  const rules = ["- 멘트 변수 규칙: 없는 변수를 지어내지 마라."]
  const p = buildOutputPrompt(outputs, {}, varsByNode, rules)
  assertStringIncludes(p, "local.reservation")          // n9 변수 노출(메커니즘)
  assertStringIncludes(p, "local.menuList")             // n20 변수 노출
  assertStringIncludes(p, "bookNo")                     // 객체 필드 노출
  assert(/앞 흐름에서 선언/.test(p))                     // 노드별 변수 표기
  assert(/배열|\[0\]/.test(p))                           // 배열 렌더(메커니즘)
  assert(!/\.join\(/.test(p))                            // 배열 표시에 함수(join) 권하지 않음(런타임 미지원)
  assertStringIncludes(p, "통째로는 안 보임")            // JSON은 통째 노출 불가 → 정확한 키로 개별 참조
  assertStringIncludes(p, "${local.reservation.bookNo}") // 객체는 정확한 키로 개별 참조 안내
  assertStringIncludes(p, "[솔루션 규칙 — 반드시 준수]")  // DB 규칙 주입 섹션
  assertStringIncludes(p, "없는 변수를 지어내지 마라")
})

Deno.test("buildConditionPrompt: 분기 갈래에 앞 흐름 선언 변수 노출 + 항목명 날조 금지", () => {
  const roots = [{ id: "r1", label: "역적 시나리오 시작" }]
  const branches = [{ id: "b1", label: "역적이름 분기", children: [
    { id: "c1", label: "정몽규일 경우" }, { id: "c2", label: "그 외" },
  ] }]
  // 분기 갈래 c1/c2는 앞 흐름에서 local.traitorName(변수명)을 쓸 수 있다(항목명 '역적이름' 아님).
  const varsByNode = {
    c1: [{ name: "local.traitorName", kind: "scalar" as const }],
    c2: [{ name: "local.traitorName", kind: "scalar" as const }],
  }
  const p = buildConditionPrompt(roots, branches, {}, [], varsByNode)
  assertStringIncludes(p, "local.traitorName")        // 실제 변수명 노출(메커니즘)
  assert(/쓸 수 있는 변수|앞 흐름에서 선언/.test(p))     // 갈래별 변수 표기
  assert(/항목명.*지어내지|지어내지.*마/.test(p))        // 항목명 날조 금지 지시
})

Deno.test("availableVarsByNode: 변수는 앞 흐름(조상)에서 선언된 것만 — 타 시나리오·하류 제외", () => {
  // 시나리오 A: a_set(local.aName) → a_out.   시나리오 B: b_set(local.bName) → b_out.
  // a_out은 local.aName만, b_out은 local.bName만 봐야 한다(서로 격리). 선언 전 노드는 빈 목록.
  const nodes = [
    { id: "a_set", type: "set", then: ["a_out"], config: { items: [{ key: "local.aName", value: "input.text" }] } },
    { id: "a_out", type: "output", then: [], config: {} },
    { id: "b_set", type: "set", then: ["b_out"], config: { items: [{ key: "local.bName", value: "input.text" }] } },
    { id: "b_out", type: "output", then: [], config: {} },
  ]
  const m = availableVarsByNode(nodes)
  assertEquals(m["a_out"].map((v) => v.name), ["local.aName"])
  assertEquals(m["b_out"].map((v) => v.name), ["local.bName"])
  assertEquals(m["a_set"], [])  // 선언 전 — 조상 없음
})

Deno.test("loopControlVars: subflow loop.condition의 변수만 추출(== true/false 무시)", () => {
  const nodes = [
    { id: "loop1", type: "subflow", config: { loop: { condition: "context.menuDone" } } },
    { id: "loop2", type: "subflow", config: { loop: { condition: "context.itemDone == true" } } },
    { id: "n1", type: "set", config: { items: [{ key: "local.menu", value: "[]" }] } },
  ]
  const s = loopControlVars(nodes)
  assert(s.has("context.menuDone"))
  assert(s.has("context.itemDone"))
  assert(!s.has("local.menu"))  // 데이터 변수는 제어 플래그가 아니다
})

Deno.test("output 멘트 변수에서 루프 종료 플래그 제외(수집 배열은 남음)", async () => {
  // 반복 수집 루프: 본문 n_set(local.menu 누적) + 종료 set(context.menuDone) → then n_out.
  // n_out 멘트에는 context.menuDone(제어 플래그)이 보이면 안 되고 local.menu(데이터)는 보여야 한다.
  const json = {
    dialogs: [{
      id: "main",
      then: ["loop1"],
      nodes: [
        { id: "loop1", type: "subflow", body: ["n_set"], then: ["n_out"], config: { loop: { condition: "context.menuDone" } } },
        { id: "n_set", type: "set", then: [], config: { items: [{ key: "local.menu", value: "local.menu.concat([input.text])" }] } },
        { id: "n_stop", type: "set", then: [], config: { items: [{ key: "context.menuDone", value: "true" }] } },
        { id: "n_out", type: "output", then: [], config: { items: [{ type: "text", text: [{ texts: ["메뉴 안내"] }] }] } },
      ],
    }],
  }
  // body·stop이 n_out의 조상이 되도록 then 연결을 보강
  json.dialogs[0].nodes[1].then = ["n_stop"]
  json.dialogs[0].nodes[2].then = ["n_out"]
  let outPrompt = ""
  await fillNodeValues(json, {}, async (p) => {
    if (p.includes("output 노드")) { outPrompt = p; return '{"n_out":{"message":"메뉴가 ${local.menu}건 확인됐어요"}}' }
    return "{}"
  }, {})
  // 멘트 작성 프롬프트의 n_out '쓸 수 있는 변수'에 제어 플래그가 없고, 데이터 배열은 있어야 한다
  assertStringIncludes(outPrompt, "local.menu")
  assert(!outPrompt.includes("context.menuDone"))
})

Deno.test("buildConfigPrompt: esd 형식(스캐폴딩) 유지 + 주입 규칙 렌더", () => {
  const rules = ["- ESD result: _result를 스코프 변수에 저장(create/findone=객체, findall=배열)."]
  const p = buildConfigPrompt([{ id: "e1", type: "esd", label: "예약 저장", config: {} }], {}, rules)
  // 필수 형식은 스캐폴딩으로 유지
  assert(/_result/.test(p))
  assert(/findall/.test(p))
  assert(/스코프|local\.|context\./.test(p))
  // DB 규칙 주입
  assertStringIncludes(p, "[솔루션 규칙 — 반드시 준수]")
  assertStringIncludes(p, "create/findone=객체")
})

Deno.test("buildConfigPrompt: 규칙 없으면 [솔루션 규칙] 섹션 미출력(폴백)", () => {
  const p = buildConfigPrompt([{ id: "e1", type: "esd", label: "예약 저장", config: {} }], {})
  assert(!/\[솔루션 규칙/.test(p))  // 빈 규칙 → 섹션 없음
  assert(/_result/.test(p))         // 형식 스캐폴딩은 항상 존재
})

Deno.test("fillNodeValues: output 패스가 config(변수) 이후 실행돼 변수 카탈로그를 받는다", async () => {
  // esd result 변수가 채워진 뒤 output 프롬프트에 그 변수가 포함돼야 한다.
  const json: any = { dialogs: [{ id: "main", nodes: [
    { id: "e1", type: "esd", label: "예약 저장", then: ["o1"], config: {}, condition: "" },
    { id: "o1", type: "output", label: "완료 안내", then: [], config: { items: [{ type: "text", text: [{ texts: ["완료 안내"] }] }] }, condition: "" },
  ]}]}
  let outputPrompt = ""
  const mock = async (p: string) => {
    if (p.includes("config 값만")) {
      // config 패스: esd result 변수를 채움
      return '{"e1":{"config":{"type":"create","query":{"where":null,"data":{"name":"local.name"}},"result":[{"key":"local.reservation","value":"_result","condition":""}],"schemaName":"reservation"}}}'
    }
    if (p.includes("실제 안내 문장")) { outputPrompt = p; return '{"o1":{"message":"예약이 완료되었어요, ${local.reservation.name}님"}}' }
    return "{}"
  }
  await fillNodeValues(json, {}, mock)
  // output 프롬프트가 config에서 채운 esd result 변수를 알고 있어야 한다
  assertStringIncludes(outputPrompt, "local.reservation")
})

Deno.test("FILLABLE_TYPES: 구조 노드 제외", () => {
  assertEquals(FILLABLE_TYPES.has("greeting"), false)
  assertEquals(FILLABLE_TYPES.has("group"), false)
  assertEquals(FILLABLE_TYPES.has("set"), true)
  assertEquals(FILLABLE_TYPES.has("esd"), true)
})

Deno.test("FILLABLE_TYPES에 llmchat 포함(fillNodeValues가 prompt를 채울 수 있게)", () => {
  assert(FILLABLE_TYPES.has("llmchat"))
})

// ── AC1: 회귀 — esdBundle 없으면 빌더 출력 바이트 동일 ────────────────

Deno.test("buildConfigPrompt: esdBundle 없으면 기존 출력과 동일(회귀 보장)", () => {
  const nodes = [{ id: "e1", type: "esd", label: "예약 저장", config: {} }]
  const base = buildConfigPrompt(nodes, { intent: {} }, ["규칙1"])
  assertEquals(base, buildConfigPrompt(nodes, { intent: {} }, ["규칙1"], false, undefined))
  assertEquals(base, buildConfigPrompt(nodes, { intent: {} }, ["규칙1"], false, null))
})

Deno.test("buildOutputPrompt: esdBundle 없으면 기존 출력과 동일(회귀 보장)", () => {
  const outputs = [{ id: "n1", label: "안내" }]
  const varsByNode = { n1: [{ name: "local.x", kind: "scalar" as const }] }
  const base = buildOutputPrompt(outputs, {}, varsByNode, ["규칙1"])
  assertEquals(base, buildOutputPrompt(outputs, {}, varsByNode, ["규칙1"], false, undefined))
  assertEquals(base, buildOutputPrompt(outputs, {}, varsByNode, ["규칙1"], false, null))
})

Deno.test("buildConditionPrompt: esdBundle 없으면 기존 출력과 동일(회귀 보장)", () => {
  const roots = [{ id: "r1", label: "시나리오 진입" }]
  const base = buildConditionPrompt(roots, [], {}, ["규칙1"])
  assertEquals(base, buildConditionPrompt(roots, [], {}, ["규칙1"], {}, undefined))
  assertEquals(base, buildConditionPrompt(roots, [], {}, ["규칙1"], {}, null))
})

// ── AC2: esdBundle 있으면 ESD 계약 섹션 포함 ─────────────────────────

const sampleEsd = {
  entities: [{
    name: "Patient",
    fields: [
      { name: "patientName", type: "string", key: false, crypt: "false" },
      { name: "phone", type: "string", key: false, crypt: "true" },
    ],
  }],
  apis: [],
}

Deno.test("buildConfigPrompt: esdBundle 있으면 ESD 계약 섹션 포함", () => {
  const nodes = [{ id: "e1", type: "esd", label: "환자 저장", config: {} }]
  const p = buildConfigPrompt(nodes, {}, [], false, sampleEsd)
  assertStringIncludes(p, "[세션 ESD 계약")
  assertStringIncludes(p, "Patient")
  assertStringIncludes(p, "patientName")
  assertStringIncludes(p, 'crypt="true"')
})

Deno.test("buildOutputPrompt: esdBundle 있으면 ESD 계약 섹션 포함", () => {
  const outputs = [{ id: "n1", label: "완료 안내" }]
  const p = buildOutputPrompt(outputs, {}, {}, [], false, sampleEsd)
  assertStringIncludes(p, "[세션 ESD 계약")
  assertStringIncludes(p, "Patient")
  assertStringIncludes(p, "phone")
})

Deno.test("buildConditionPrompt: esdBundle 있으면 ESD 계약 섹션 포함", () => {
  const roots = [{ id: "r1", label: "예약 시나리오" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, sampleEsd)
  assertStringIncludes(p, "[세션 ESD 계약")
  assertStringIncludes(p, "Patient")
  assertStringIncludes(p, "patientName")
})

// ── v0.8.1: NLP 기준 조건 ────────────────────────────────────────────────

const nlpBundle = {
  intents: [
    { name: "배송조회", examples: ["언제 와요"] },
    { name: "주문취소", examples: ["취소할래"] },
  ],
  entities: [
    { name: "배송정보", type: "synonyms", values: [{ value: "도착일", synonyms: ["언제"] }, { value: "배송상태", synonyms: ["어디쯤"] }] },
  ],
}

Deno.test("buildConditionPrompt: 번들을 주면 사용 가능한 인텐트·엔티티 목록을 렌더한다", () => {
  const roots = [{ id: "r1", label: "배송 조회 시작" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, nlpBundle)
  assertStringIncludes(p, "[사용 가능한 인텐트]")
  assertStringIncludes(p, "배송조회")
  assertStringIncludes(p, "[사용 가능한 엔티티]")
  assertStringIncludes(p, "배송정보:도착일")
})

Deno.test("buildConditionPrompt: 번들이 없으면 목록 섹션 자체가 없다(빈 목록 금지)", () => {
  const roots = [{ id: "r1", label: "배송 조회 시작" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, undefined)
  assertEquals(p.includes("[사용 가능한 인텐트]"), false)
  assertEquals(p.includes("[사용 가능한 엔티티]"), false)
})

Deno.test("buildConditionPrompt: 루트별 인텐트명을 주면 그 이름을 그대로 쓰라고 지시한다", () => {
  const roots = [{ id: "r1", label: "배송 조회 시작" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, nlpBundle, { r1: "배송조회" })
  assertStringIncludes(p, 'intent("배송조회")')
})

Deno.test("buildConditionPrompt: 진입 조건 지시가 intent()로 바뀌었다(발화 매칭 권장 폐지)", () => {
  const roots = [{ id: "r1", label: "배송 조회 시작" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, nlpBundle)
  assertStringIncludes(p, "루트의 condition은 intent()")
  assertEquals(p.includes("input.text.includes('진료 예약 할래')"), false)
})

Deno.test("buildConditionPrompt: 발화로 갈리는 분기는 entity()를 쓰라고 지시한다", () => {
  const roots = [{ id: "r1", label: "x" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, nlpBundle)
  assertStringIncludes(p, 'entity("<엔티티명>:<값>")')
})

Deno.test("buildConditionPrompt: 하드코딩 술어 목록 줄이 사라졌다(규약은 DB 규칙으로)", () => {
  const roots = [{ id: "r1", label: "x" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, nlpBundle)
  assertEquals(p.includes("[DialogFlow 술어]"), false)
})

Deno.test("buildConditionPrompt: 분기 예시가 저장 변수 판별로 바뀌었다(DB 규칙과의 모순 해소)", () => {
  // solution_rules의 Condition Rule "조건에서 _result 말고 저장 변수로 판별"이 condition 단계에
  // 주입되는데 프롬프트 예시가 _result를 권하고 있었다 — 규칙과 예시가 정면으로 충돌.
  const roots = [{ id: "r1", label: "x" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, nlpBundle)
  assertEquals(p.includes('_result != null'), false)
  assertStringIncludes(p, 'local.parkingInfo != null')
})

Deno.test("fillNodeValues: 번들·루트 인텐트명을 조건 프롬프트까지 전달한다", async () => {
  const flow = {
    dialogs: [{
      id: "main",
      then: ["r1"],
      nodes: [
        { id: "r1", type: "output", label: "배송 조회 시작" },
      ],
    }],
  }
  const prompts: string[] = []
  const callLlm = (p: string) => { prompts.push(p); return Promise.resolve("{}") }
  await fillNodeValues(flow, {}, callLlm, {}, {}, undefined, undefined, nlpBundle, { r1: "배송조회" })
  const condPrompt = prompts.find((p) => p.includes("condition(조건식)만 채워라"))
  assertEquals(typeof condPrompt, "string")
  assertStringIncludes(condPrompt!, "[사용 가능한 인텐트]")
  assertStringIncludes(condPrompt!, 'intent("배송조회")')
})

Deno.test("fillNodeValues: 번들을 안 넘겨도 동작한다(무해 계약 — NLP 실패 시 경로)", async () => {
  const flow = {
    dialogs: [{ id: "main", then: ["r1"], nodes: [{ id: "r1", type: "output", label: "배송 조회 시작" }] }],
  }
  const prompts: string[] = []
  const callLlm = (p: string) => { prompts.push(p); return Promise.resolve("{}") }
  await fillNodeValues(flow, {}, callLlm, {}, {}, undefined, undefined)
  const condPrompt = prompts.find((p) => p.includes("condition(조건식)만 채워라"))
  assertEquals(typeof condPrompt, "string")
  assertEquals(condPrompt!.includes("[사용 가능한 인텐트]"), false)
})

Deno.test("buildConditionPrompt: 번들이 없으면 발화 매칭으로 폴백한다(NLP 데이터 없는 봇 구제)", () => {
  // NLP 파생이 실패하면 intents.csv 자체가 없다 — 그런데도 intent() 조건을 넣으면
  // 학습된 인텐트가 하나도 없어 봇이 어떤 시나리오에도 진입하지 못한다.
  const roots = [{ id: "r1", label: "배송 조회 시작" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, undefined)
  assertStringIncludes(p, "input.text.includes(")
  assertEquals(p.includes("각 루트의 condition은 intent() 하나다"), false)
})

Deno.test("buildConditionPrompt: 엔티티가 없으면 entity() 지시를 넣지 않는다", () => {
  const roots = [{ id: "r1", label: "x" }]
  const onlyIntents = { intents: [{ name: "배송조회", examples: [] }], entities: [] }
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, onlyIntents)
  assertStringIncludes(p, "각 루트의 condition은 intent() 하나다")
  assertEquals(p.includes('entity("<엔티티명>:<값>")'), false)
})

Deno.test("buildConditionPrompt: 분기 갈래를 전부 비우지 말라고 명시한다(A·B 실측 결함)", () => {
  // dev 실측에서 2갈래 분기의 자식 둘 다 condition이 빈 값으로 나왔다 —
  // 쓸 엔티티가 목록에 없자 LLM이 아무것도 채우지 않았다. 봇이 어느 갈래도 고르지 못한다.
  const roots = [{ id: "r1", label: "x" }]
  const p = buildConditionPrompt(roots, [], {}, [], {}, undefined, nlpBundle)
  assertStringIncludes(p, "한 분기의 갈래를 전부 빈 값으로 두지 마라")
  assertStringIncludes(p, 'input.text.includes("발화")')
})

// ── ESD 조회 결과 필드(resultFields) — 2026-10-14 ──
// 실측: 조회 노드 30개 중 27개가 스키마에 조회 키 외 필드 0 → 멘트 미사용 73%·없는 키 16%.
function lookupFlow() {
  return {
    dialogs: [{
      id: "main",
      then: ["e1"],
      nodes: [
        {
          id: "e1", type: "esd", label: "보험 정보 조회", then: ["o1"],
          config: {
            type: "findone", schemaName: "insurance",
            query: { where: [{ field: "subscriber_number", value: "local.sn", expression: "eq" }] },
            result: [{ key: "local.info", value: "_result", condition: "" }],
          },
        },
        { id: "o1", type: "output", label: "보장률·한도 안내", config: { items: [{ type: "text", text: [{ texts: ["보장률·한도 안내"] }] }] } },
      ],
    }],
  }
}

Deno.test("fillNodeValues: config 패스의 resultFields가 output 프롬프트의 변수 키로 실린다", async () => {
  const flow = lookupFlow()
  const prompts: string[] = []
  const callLlm = (p: string) => {
    prompts.push(p)
    if (p.includes("config 값만")) {
      return Promise.resolve(JSON.stringify({
        e1: { config: flow.dialogs[0].nodes[0].config, resultFields: ["coverage_rate", "remaining_limit"] },
      }))
    }
    return Promise.resolve("{}")
  }
  const res = await fillNodeValues(flow, {}, callLlm)
  const outPrompt = prompts.find((p) => p.includes("id=o1"))!
  assertStringIncludes(outPrompt, "${local.info.coverage_rate}")
  assertStringIncludes(outPrompt, "${local.info.remaining_limit}")
  assertEquals(res.esdResultFields, { insurance: ["coverage_rate", "remaining_limit"] })
  // 봇 JSON에는 resultFields가 남지 않는다(왕복 무손실)
  assertEquals("resultFields" in (flow.dialogs[0].nodes[0] as any), false)
  assertEquals("resultFields" in (flow.dialogs[0].nodes[0].config as any), false)
})

Deno.test("fillNodeValues: 멘트가 스키마에 없는 키를 쓰면 esdRefUnknownKeys로 남긴다", async () => {
  const flow = lookupFlow()
  const callLlm = (p: string) => {
    if (p.includes("config 값만")) {
      return Promise.resolve(JSON.stringify({ e1: { config: flow.dialogs[0].nodes[0].config, resultFields: ["coverage_rate"] } }))
    }
    if (p.includes("id=o1")) {
      return Promise.resolve(JSON.stringify({ o1: { message: "보장률 ${local.info.coverage_rate}, 한도 ${local.info.made_up}" } }))
    }
    return Promise.resolve("{}")
  }
  const res = await fillNodeValues(flow, {}, callLlm)
  assertEquals(res.esdRefUnknownKeys, [{ nodeId: "o1", ref: "local.info.made_up", schemaName: "insurance" }])
})

Deno.test("buildConfigPrompt: 조회 노드에 resultFields를 내라는 형식이 있다", () => {
  const p = buildConfigPrompt([], {})
  assertStringIncludes(p, "resultFields")
  assertStringIncludes(p, "받을 정보")
})

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { proposeMapping } from "./proposeMapping.js"

// --- 픽스처 헬퍼 ---

function mkEsd(entityName, fields) {
  return {
    entities: [{
      name: entityName,
      fields: fields.map((f) => ({
        name: f.name,
        type: f.type ?? "string",
        key: f.key ?? false,
        crypt: f.crypt ?? "false",
        readOnly: false,
        useSearch: false,
        description: "",
      })),
    }],
    apis: [],
  }
}

function mkVar(name, type = "string") {
  return { name, type }
}

// --- AC2: 이름 완전일치 + 타입일치 → auto:true ---

Deno.test("AC2: 이름 완전일치 + 타입일치 → auto:true, score=1.0", () => {
  const esd = mkEsd("고객", [{ name: "customerName", type: "string" }])
  const vars = [mkVar("customerName", "string")]
  const { mappings, unmappedEsdFields, unmappedVars } = proposeMapping(esd, vars)

  assertEquals(mappings.length, 1)
  assertEquals(mappings[0].auto, true)
  assertEquals(mappings[0].candidates[0].score, 1.0)
  assertEquals(mappings[0].candidates[0].varName, "customerName")
  assertEquals(unmappedEsdFields.length, 0)
  assertEquals(unmappedVars.length, 0)
})

Deno.test("AC2: 이름 대소문자·구분자 차이 → 완전일치 처리 + 타입일치 → auto:true", () => {
  const esd = mkEsd("주문", [{ name: "orderId", type: "string" }])
  // 수집변수 이름이 다른 구분자/대소문자: "order_id" → normalize → "orderid" 일치
  const vars = [mkVar("order_id", "string")]
  const { mappings } = proposeMapping(esd, vars)
  assertEquals(mappings[0].auto, true)
  assertEquals(mappings[0].candidates[0].score, 1.0)
})

Deno.test("AC2: 숫자 타입 완전일치 → auto:true", () => {
  const esd = mkEsd("주문", [{ name: "amount", type: "number" }])
  const vars = [mkVar("amount", "number")]
  const { mappings } = proposeMapping(esd, vars)
  assertEquals(mappings[0].auto, true)
})

Deno.test("AC2: 여러 필드 중 완전일치 하나만 auto:true", () => {
  const esd = mkEsd("고객", [
    { name: "customerId", type: "string" },
    { name: "amount", type: "number" },
  ])
  const vars = [
    mkVar("customerId", "string"),
    mkVar("total", "number"),   // "amount" 와 다른 이름
  ]
  const { mappings } = proposeMapping(esd, vars)
  // customerId 완전일치
  assertEquals(mappings[0].auto, true)
  // amount 는 "total" 과 이름 불일치
  assertEquals(mappings[1].auto, false)
})

// --- AC3: 애매(부분일치·타입불일치·다대다) → 후보 목록, auto:false ---

Deno.test("AC3a: 이름 완전일치지만 타입불일치 → auto:false, score=0.8", () => {
  const esd = mkEsd("주문", [{ name: "amount", type: "number" }])
  const vars = [mkVar("amount", "string")]   // 타입 불일치
  const { mappings } = proposeMapping(esd, vars)

  assertEquals(mappings[0].auto, false)
  assertEquals(mappings[0].candidates.length, 1)
  assertEquals(mappings[0].candidates[0].score, 0.8)
})

Deno.test("AC3b: 부분일치(토큰 겹침) → auto:false, candidates 반환", () => {
  // "customerAddress" ↔ "customerName" → 토큰 ["customer","address"] vs ["customer","name"]
  // Dice = 2*1/(2+2) = 0.5 ≥ PARTIAL_MIN(0.3) → 후보
  const esd = mkEsd("고객", [{ name: "customerAddress", type: "string" }])
  const vars = [mkVar("customerName", "string")]
  const { mappings } = proposeMapping(esd, vars)

  assertEquals(mappings[0].auto, false)
  assertEquals(mappings[0].candidates.length >= 1, true)
  const c = mappings[0].candidates[0]
  assertEquals(c.varName, "customerName")
  // score < 1.0 (부분 일치)
  assertEquals(c.score < 1.0, true)
  assertEquals(c.score > 0, true)
})

Deno.test("AC3c: 다대다 — 두 ESD 필드가 동일 var를 완전일치로 경쟁 → 둘 다 auto:false", () => {
  const esd = {
    entities: [
      { name: "A", fields: [{ name: "phone", type: "string", key: false, crypt: "false" }] },
      { name: "B", fields: [{ name: "phone", type: "string", key: false, crypt: "false" }] },
    ],
    apis: [],
  }
  const vars = [mkVar("phone", "string")]
  const { mappings } = proposeMapping(esd, vars)

  assertEquals(mappings.length, 2)
  // 두 ESD 필드 모두 동일 var를 score=1.0으로 주장 → 어느 쪽도 auto:false
  assertEquals(mappings[0].auto, false)
  assertEquals(mappings[1].auto, false)
  // 그러나 candidates는 있음
  assertEquals(mappings[0].candidates.length, 1)
  assertEquals(mappings[1].candidates.length, 1)
})

Deno.test("AC3d: 두 수집변수가 같은 ESD 필드에 score=1.0으로 경쟁 → auto:false", () => {
  // "orderId"와 "order_id" 모두 normalize → "orderid", 타입도 string 동일 → 두 perfect 후보
  // perfects.length === 2 → 1:1 조건 미충족 → auto:false
  const esd = mkEsd("주문", [{ name: "orderId", type: "string" }])
  const vars = [mkVar("orderId", "string"), mkVar("order_id", "string")]
  const { mappings } = proposeMapping(esd, vars)

  assertEquals(mappings[0].auto, false)
  const perfects = mappings[0].candidates.filter((c) => c.score === 1.0)
  assertEquals(perfects.length, 2)
})

// --- AC4: 매칭 없는 ESD 필드·수집변수 → 미매핑 ---

Deno.test("AC4a: 매칭 없는 ESD 필드 → unmappedEsdFields에 포함", () => {
  const esd = mkEsd("엔티티", [{ name: "completelyDifferentField", type: "number" }])
  const vars = [mkVar("unrelatedVar", "string")]
  const { unmappedEsdFields, unmappedVars } = proposeMapping(esd, vars)

  assertEquals(unmappedEsdFields.length, 1)
  assertEquals(unmappedEsdFields[0].name, "completelyDifferentField")
  assertEquals(unmappedVars.length, 1)
  assertEquals(unmappedVars[0].name, "unrelatedVar")
})

Deno.test("AC4b: 수집변수가 어느 ESD 필드 후보에도 없으면 unmappedVars", () => {
  const esd = mkEsd("주문", [{ name: "orderId", type: "string" }])
  const vars = [mkVar("orderId", "string"), mkVar("ghostVar", "boolean")]
  const { unmappedVars } = proposeMapping(esd, vars)

  // "orderId" 완전일치 → candidates에 있음
  // "ghostVar" → 아무 후보에도 없음
  assertEquals(unmappedVars.length, 1)
  assertEquals(unmappedVars[0].name, "ghostVar")
})

Deno.test("AC4c: 전체 매핑 성공 시 unmapped 둘 다 빈 배열", () => {
  const esd = mkEsd("고객", [
    { name: "customerId", type: "string" },
    { name: "amount", type: "number" },
  ])
  const vars = [mkVar("customerId", "string"), mkVar("amount", "number")]
  const { unmappedEsdFields, unmappedVars } = proposeMapping(esd, vars)

  assertEquals(unmappedEsdFields.length, 0)
  assertEquals(unmappedVars.length, 0)
})

// --- AC5: 빈/null 입력 → 안전(throw 없음, 빈 매핑) ---

Deno.test("AC5a: null esd + null collectVars → 빈 결과, throw 없음", () => {
  const result = proposeMapping(null, null)
  assertEquals(result.mappings.length, 0)
  assertEquals(result.unmappedEsdFields.length, 0)
  assertEquals(result.unmappedVars.length, 0)
})

Deno.test("AC5b: undefined esd + undefined collectVars → 빈 결과, throw 없음", () => {
  const result = proposeMapping(undefined, undefined)
  assertEquals(result.mappings.length, 0)
  assertEquals(result.unmappedEsdFields.length, 0)
  assertEquals(result.unmappedVars.length, 0)
})

Deno.test("AC5c: 빈 entities → 빈 mappings, collectVars 모두 unmappedVars", () => {
  const esd = { entities: [], apis: [] }
  const vars = [mkVar("phone", "string"), mkVar("name", "string")]
  const { mappings, unmappedEsdFields, unmappedVars } = proposeMapping(esd, vars)

  assertEquals(mappings.length, 0)
  assertEquals(unmappedEsdFields.length, 0)
  assertEquals(unmappedVars.length, 2)
})

Deno.test("AC5d: 빈 collectVars → ESD 필드 모두 unmappedEsdFields", () => {
  const esd = mkEsd("고객", [{ name: "customerId", type: "string" }])
  const { mappings, unmappedEsdFields, unmappedVars } = proposeMapping(esd, [])

  assertEquals(mappings.length, 1)
  assertEquals(mappings[0].candidates.length, 0)
  assertEquals(unmappedEsdFields.length, 1)
  assertEquals(unmappedVars.length, 0)
})

Deno.test("AC5e: esd에 entities 키 없음(빈 객체) → throw 없음", () => {
  const result = proposeMapping({}, [mkVar("x", "string")])
  assertEquals(result.mappings.length, 0)
  assertEquals(result.unmappedVars.length, 1)
})

Deno.test("AC5f: entity.fields 없음(undefined) → throw 없음", () => {
  const esd = { entities: [{ name: "엔티티" }], apis: [] }
  const vars = [mkVar("x", "string")]
  const result = proposeMapping(esd, vars)
  assertEquals(result.mappings.length, 0)
  assertEquals(result.unmappedVars.length, 1)
})

// --- 반환 계약 검증 (EsdMappingView·MappingStep 소비용) ---

Deno.test("반환 계약: mappings 항목이 esdField·candidates·auto 키를 포함", () => {
  const esd = mkEsd("주문", [{ name: "orderId", type: "string" }])
  const vars = [mkVar("orderId", "string")]
  const { mappings } = proposeMapping(esd, vars)

  const m = mappings[0]
  assertEquals(typeof m.auto, "boolean")
  assertEquals(typeof m.esdField.entityName, "string")
  assertEquals(typeof m.esdField.name, "string")
  assertEquals(typeof m.esdField.type, "string")
  assertEquals(Array.isArray(m.candidates), true)
})

Deno.test("반환 계약: candidates 항목이 varName·varType·score 키를 포함", () => {
  const esd = mkEsd("주문", [{ name: "orderId", type: "string" }])
  const vars = [mkVar("orderId", "string")]
  const { mappings } = proposeMapping(esd, vars)

  const c = mappings[0].candidates[0]
  assertEquals(typeof c.varName, "string")
  assertEquals(typeof c.varType, "string")
  assertEquals(typeof c.score, "number")
})

Deno.test("반환 계약: esdField에 entityName·key·crypt 포함", () => {
  const esd = mkEsd("고객", [{ name: "customerId", type: "string", key: true, crypt: "true" }])
  const vars = [mkVar("customerId", "string")]
  const { mappings } = proposeMapping(esd, vars)

  const f = mappings[0].esdField
  assertEquals(f.entityName, "고객")
  assertEquals(f.key, true)
  assertEquals(f.crypt, "true")
})

Deno.test("반환 계약: candidates는 score 내림차순 정렬", () => {
  // orderId 완전일치(1.0), orderInfo 부분일치(< 1.0)
  const esd = mkEsd("주문", [{ name: "orderId", type: "string" }])
  const vars = [mkVar("orderInfo", "string"), mkVar("orderId", "string")]
  const { mappings } = proposeMapping(esd, vars)

  const scores = mappings[0].candidates.map((c) => c.score)
  for (let i = 1; i < scores.length; i++) {
    assertEquals(scores[i - 1] >= scores[i], true)
  }
})

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { injectEsd, injectConfirmedMapping, buildConfirmedMapping } from "./generatorBody.js"

const BASE = { responses: [{ id: 1, answer: "a" }], reference_id: "ref-id" }

Deno.test("AC1: esd 있음 → body에 esd 포함", () => {
  const esd = { entities: [{ name: "고객" }], apis: [] }
  const body = injectEsd(BASE, esd)
  assertEquals(body.esd, esd)
  assertEquals(body.reference_id, "ref-id")
})

Deno.test("AC2: esd undefined → body에 esd 키 없음", () => {
  const body = injectEsd(BASE, undefined)
  assertEquals("esd" in body, false)
})

Deno.test("AC2: esd null → body에 esd 키 없음", () => {
  const body = injectEsd(BASE, null)
  assertEquals("esd" in body, false)
})

Deno.test("AC2: esd 생략 → body 종전과 동일(esd 키 부재)", () => {
  const body = injectEsd(BASE)
  assertEquals("esd" in body, false)
  assertEquals(body, BASE)
})

Deno.test("원본 객체 불변 — 새 객체 반환", () => {
  const esd = { entities: [] }
  const body = injectEsd(BASE, esd)
  assertEquals(body !== BASE, true)
  assertEquals("esd" in BASE, false)
})

// ── injectConfirmedMapping ──

Deno.test("AC-T7-1: confirmedMapping 비어있지 않은 배열 → body에 confirmed_mapping 포함", () => {
  const cm = [{ esdField: "phone", varName: "phone" }]
  const body = injectConfirmedMapping(BASE, cm)
  assertEquals(body.confirmed_mapping, cm)
  assertEquals(body.reference_id, "ref-id")
})

Deno.test("AC-T7-2(회귀): confirmedMapping undefined → body 무변화", () => {
  const body = injectConfirmedMapping(BASE, undefined)
  assertEquals("confirmed_mapping" in body, false)
  assertEquals(body, BASE)
})

Deno.test("AC-T7-2(회귀): confirmedMapping null → body 무변화", () => {
  const body = injectConfirmedMapping(BASE, null)
  assertEquals("confirmed_mapping" in body, false)
})

Deno.test("AC-T7-2(회귀): confirmedMapping 빈 배열 → body 무변화", () => {
  const body = injectConfirmedMapping(BASE, [])
  assertEquals("confirmed_mapping" in body, false)
})

Deno.test("AC-T7-3: injectConfirmedMapping 원본 불변", () => {
  const cm = [{ esdField: "x", varName: "x" }]
  const body = injectConfirmedMapping(BASE, cm)
  assertEquals(body !== BASE, true)
  assertEquals("confirmed_mapping" in BASE, false)
})

// ── buildConfirmedMapping ──

Deno.test("AC-T7-4: buildConfirmedMapping — 선택된 varName 반영", () => {
  const mappings = [
    { esdField: { name: "phone" }, candidates: [{ varName: "phone", varType: "string", score: 1 }], auto: true },
    { esdField: { name: "addr" }, candidates: [], auto: false },
  ]
  const selections = { phone: "phone_number", addr: null }
  const result = buildConfirmedMapping(mappings, selections)
  assertEquals(result, [
    { esdField: "phone", varName: "phone_number" },
    { esdField: "addr", varName: null },
  ])
})

Deno.test("AC-T7-5: buildConfirmedMapping — selections에 없는 필드는 varName null", () => {
  const mappings = [{ esdField: { name: "x" }, candidates: [], auto: false }]
  const result = buildConfirmedMapping(mappings, {})
  assertEquals(result, [{ esdField: "x", varName: null }])
})

Deno.test("AC-T7-6: buildConfirmedMapping — mappings 빈 배열 → 빈 배열", () => {
  assertEquals(buildConfirmedMapping([], {}), [])
})

Deno.test("AC-T7-7: buildConfirmedMapping — mappings null/undefined → 빈 배열", () => {
  assertEquals(buildConfirmedMapping(null, {}), [])
  assertEquals(buildConfirmedMapping(undefined, {}), [])
})

// ── T8 통합 회귀·불변식 검증 ──────────────────────────────────────────────

Deno.test("AC2(T8): esd=null + confirmedMapping=undefined → body 종전과 완전 동일(전후 diff=0)", () => {
  // esd 미연결 생성 경로: 두 주입함수 모두 body를 무변화로 통과 → payload diff=0
  const body1 = injectEsd(BASE, null)
  const body2 = injectConfirmedMapping(body1, undefined)
  assertEquals(body2, BASE)
})

Deno.test("AC3(T8): buildConfirmedMapping — {esdField, varName} 데이터 배열만 반환", () => {
  // 매핑 지침은 solution_rules(DB) → RULE_STAGE_BY_CATEGORY("Value Generation Rule"→config) 경로로 주입됨.
  // 이 함수는 {esdField, varName} 데이터 배열만 빌드한다(지침 문구 미포함).
  const mappings = [{ esdField: { name: "phone" }, candidates: [], auto: false }]
  const cm = buildConfirmedMapping(mappings, { phone: "phoneVar" })
  assertEquals(cm.length, 1)
  assertEquals(Object.keys(cm[0]).sort(), ["esdField", "varName"])
})

Deno.test("AC4(T8): injectConfirmedMapping — FlowSpec 구조 키 미주입, confirmed_mapping만 추가", () => {
  // 매핑 주입은 request body에 confirmed_mapping(데이터)만 추가 → FlowSpec(nodes/entry/version) 불변.
  // 생성기 내부 flow 단계가 validateFlow/repairFlow로 구조 불변식을 보장하며,
  // 매핑 주입은 그 이후 config 프롬프트 텍스트에만 영향 → D1 불변식 유지.
  const cm = [{ esdField: "phone", varName: "phoneVar" }]
  const body = injectConfirmedMapping(BASE, cm)
  assertEquals("nodes" in body, false)
  assertEquals("entry" in body, false)
  assertEquals("version" in body, false)
  const addedKeys = Object.keys(body).filter((k) => !(k in BASE))
  assertEquals(addedKeys, ["confirmed_mapping"])
})

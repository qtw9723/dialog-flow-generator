import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { proposeMapping } from "./proposeMapping.ts"

const sampleEsd = {
  entities: [{
    name: "Patient",
    fields: [
      { name: "patientName", type: "string", key: false, crypt: "false" },
      { name: "phone", type: "string", key: false, crypt: "true" },
      { name: "age", type: "number", key: false, crypt: "false" },
    ],
  }],
}

Deno.test("proposeMapping: 이름 완전일치·타입일치 → auto=true", () => {
  // 스코프 없는 순수 변수명으로 매칭(generator는 extractCollectVarsFromJson에서 prefix 제거)
  const vars = [
    { name: "patientName", type: "string" },
    { name: "phone", type: "string" },
  ]
  const result = proposeMapping(sampleEsd, vars)
  const byField = Object.fromEntries(result.mappings.map((m) => [m.esdField.name, m]))
  assertEquals(byField["patientName"].auto, true)
  assertEquals(byField["phone"].auto, true)
  assertEquals(byField["patientName"].candidates[0].varName, "patientName")
})

Deno.test("proposeMapping: 타입 불일치 → auto=false", () => {
  const vars = [{ name: "age", type: "string" }]  // age는 number인데 string으로
  const result = proposeMapping(sampleEsd, vars)
  const m = result.mappings.find((m) => m.esdField.name === "age")!
  assertEquals(m.auto, false)
  assertEquals(m.candidates.length > 0, true)
})

Deno.test("proposeMapping: 후보 없음 → unmappedEsdFields 포함", () => {
  const vars = [{ name: "unrelated", type: "string" }]
  const result = proposeMapping(sampleEsd, vars)
  const unmappedNames = result.unmappedEsdFields.map((f) => f.name)
  assertEquals(unmappedNames.includes("patientName"), true)
  assertEquals(unmappedNames.includes("phone"), true)
})

Deno.test("proposeMapping: 매핑 없는 수집변수 → unmappedVars 포함", () => {
  const vars = [{ name: "irrelevant", type: "boolean" }]
  const result = proposeMapping(sampleEsd, vars)
  assertEquals(result.unmappedVars.some((v) => v.name === "irrelevant"), true)
})

Deno.test("proposeMapping: 빈 입력 safe", () => {
  assertEquals(proposeMapping(null, []).mappings.length, 0)
  assertEquals(proposeMapping(undefined, []).mappings.length, 0)
  assertEquals(proposeMapping({}, []).mappings.length, 0)
  assertEquals(proposeMapping(sampleEsd, []).unmappedVars.length, 0)
})

Deno.test("proposeMapping: crypt 필드 반환 계약 포함", () => {
  const vars = [{ name: "phone", type: "string" }]
  const result = proposeMapping(sampleEsd, vars)
  const m = result.mappings.find((m) => m.esdField.name === "phone")!
  assertEquals(m.esdField.crypt, "true")
  assertEquals(typeof m.esdField.key, "boolean")
  assertEquals(m.esdField.entityName, "Patient")
})

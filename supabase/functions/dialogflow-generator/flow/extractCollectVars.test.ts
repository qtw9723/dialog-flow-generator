import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { extractCollectVarsFromJson } from "./extractCollectVars.ts"
import { proposeMapping } from "./proposeMapping.ts"

const sampleEsd = {
  entities: [{
    name: "Patient",
    fields: [
      { name: "age", type: "number", key: false, crypt: "false" },
      { name: "name", type: "string", key: false, crypt: "false" },
    ],
  }],
}

const flowWithAge = {
  dialogs: [{
    nodes: [
      { type: "set", config: { items: [{ key: "local.age", value: "input.text" }] } },
    ],
  }],
}

// AC1: ESD number 필드에 이름 일치 → 추출 type이 number로 보정
Deno.test("AC1: ESD number 필드 매칭 → type=number", () => {
  const result = extractCollectVarsFromJson(flowWithAge, sampleEsd)
  const ageVar = result.find((v) => v.name === "age")!
  assertEquals(ageVar.type, "number")
})

// AC2: 보정 후 proposeMapping → auto=true (name·type 완전일치)
Deno.test("AC2: type 보정 후 proposeMapping → auto=true", () => {
  const collectVars = extractCollectVarsFromJson(flowWithAge, sampleEsd)
  const mapping = proposeMapping(sampleEsd, collectVars)
  const ageMapping = mapping.mappings.find((m) => m.esdField.name === "age")!
  assertEquals(ageMapping.auto, true)
})

// AC3-a: esdBundle 없음(미연결) → 종전 string 유지
Deno.test("AC3-a: esd 미연결 → type=string(종전 동작)", () => {
  const result = extractCollectVarsFromJson(flowWithAge)
  const ageVar = result.find((v) => v.name === "age")!
  assertEquals(ageVar.type, "string")
})

// AC3-b: ESD 필드에 매칭 안 되는 변수 → string
Deno.test("AC3-b: ESD 필드 미매칭 변수 → type=string", () => {
  const flowWithUnknown = {
    dialogs: [{
      nodes: [{ type: "set", config: { items: [{ key: "local.unknown", value: "x" }] } }],
    }],
  }
  const result = extractCollectVarsFromJson(flowWithUnknown, sampleEsd)
  const unknownVar = result.find((v) => v.name === "unknown")!
  assertEquals(unknownVar.type, "string")
})

// AC3-c: string 타입 ESD 필드 매칭 → string 유지(변화 없음)
Deno.test("AC3-c: ESD string 필드 매칭 → type=string 유지", () => {
  const flowWithName = {
    dialogs: [{
      nodes: [{ type: "set", config: { items: [{ key: "local.name", value: "x" }] } }],
    }],
  }
  const result = extractCollectVarsFromJson(flowWithName, sampleEsd)
  const nameVar = result.find((v) => v.name === "name")!
  assertEquals(nameVar.type, "string")
})

// 스코프 접두사 제거 후 이름 매칭(context./global. 포함)
Deno.test("스코프 접두사 제거 후 ESD 매칭", () => {
  const flowWithContext = {
    dialogs: [{
      nodes: [{ type: "set", config: { items: [{ key: "context.age", value: "x" }] } }],
    }],
  }
  const result = extractCollectVarsFromJson(flowWithContext, sampleEsd)
  const ageVar = result.find((v) => v.name === "age")!
  assertEquals(ageVar.type, "number")
})

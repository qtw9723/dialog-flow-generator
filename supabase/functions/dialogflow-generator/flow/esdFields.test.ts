import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  esdSchemaNameOf,
  extractResultFields,
  findUnknownEsdRefs,
  findUnusedLookups,
  resolveResultFields,
  schemaFieldsOf,
} from "./esdFields.ts"

const lookup = (id: string, schemaName: string, where: string[], resultKey = "local.info", type = "findone", inQuery = false) => ({
  id,
  type: "esd",
  then: [] as string[],
  config: {
    type,
    query: { where: where.map((f) => ({ field: f, value: `local.${f}`, expression: "eq" })), ...(inQuery ? { schemaName } : {}) },
    result: [{ key: resultKey, value: "_result", condition: "" }],
    ...(inQuery ? {} : { schemaName }),
  },
})

const create = (id: string, schemaName: string, data: Record<string, string>) => ({
  id,
  type: "esd",
  config: { type: "create", query: { where: null, data }, result: [], schemaName },
})

const output = (id: string, text: string) => ({
  id,
  type: "output",
  config: { items: [{ type: "text", text: [{ texts: [text] }] }] },
})

Deno.test("esdSchemaNameOf — config.query.schemaName과 config.schemaName 둘 다 읽는다", () => {
  assertEquals(esdSchemaNameOf(lookup("a", "insurance", [])), "insurance")
  assertEquals(esdSchemaNameOf(lookup("a", "insurance", [], "local.x", "findone", true)), "insurance")
  assertEquals(esdSchemaNameOf({ type: "esd", config: {} }), null)
})

Deno.test("extractResultFields — 조회 노드 패치의 resultFields만 영문 키로 걸러 모은다", () => {
  const nodes = [lookup("n1", "insurance", ["subscriber_number"]), create("n2", "log", { a: "x" })]
  const patches = {
    n1: { config: {}, resultFields: ["coverage_rate", "remaining_limit", "보장률", "coverage_rate", "", 3] },
    n2: { config: {}, resultFields: ["should_ignore"] }, // create는 조회가 아니다
    nX: { resultFields: ["ghost"] },                       // 모르는 노드
  }
  assertEquals(extractResultFields(nodes, patches as any), { n1: ["coverage_rate", "remaining_limit"] })
})

Deno.test("resolveResultFields — 선행 확정 ESD가 있으면 그 엔티티 필드 안에서만 고른다", () => {
  const nodes = [lookup("n1", "insurance", ["subscriber_number"])]
  const esdBundle = { entities: [{ name: "insurance", fields: [{ name: "subscriber_number" }, { name: "coverage_rate" }, { name: "deductible" }] }] }
  // LLM이 엔티티에 없는 키를 섞어도 엔티티 필드만 남는다
  assertEquals(resolveResultFields(nodes, { n1: ["coverage_rate", "made_up"] }, esdBundle), { insurance: ["coverage_rate"] })
  // LLM 결과가 엔티티와 하나도 안 겹치면 엔티티의 조회 키 외 필드 전부
  assertEquals(resolveResultFields(nodes, {}, esdBundle), { insurance: ["coverage_rate", "deductible"] })
})

Deno.test("resolveResultFields — 선행 ESD가 없으면 LLM 추론 필드, 같은 스키마는 합친다", () => {
  const nodes = [
    lookup("n1", "insurance", ["subscriber_number"], "local.a"),
    lookup("n2", "insurance", ["group_number"], "local.b", "findall"),
  ]
  assertEquals(
    resolveResultFields(nodes, { n1: ["coverage_rate"], n2: ["coverage_rate", "deductible"] }, null),
    { insurance: ["coverage_rate", "deductible"] },
  )
})

Deno.test("schemaFieldsOf — data 키(빈 값 제외) ∪ where ∪ resultFields, 순서 보존·중복 제거", () => {
  const nodes = [
    create("c1", "insurance", { subscriber_number: "local.sn", leftover: "" }),
    lookup("n1", "insurance", ["subscriber_number", "group_number"], "local.a", "findone", true),
  ]
  assertEquals(
    schemaFieldsOf(nodes, { insurance: ["coverage_rate", "group_number"] }),
    { insurance: ["subscriber_number", "group_number", "coverage_rate"] },
  )
})

Deno.test("findUnknownEsdRefs — 하류 멘트가 스키마에 없는 키로 조회 결과를 참조하면 잡는다", () => {
  const n1 = lookup("n1", "insurance", ["subscriber_number"], "local.info")
  n1.then = ["o1"]
  const nodes = [n1, output("o1", "보장률 ${local.info.coverage_rate}, 한도 ${local.info.limit_amt}, 건수 ${local.info.length}")]
  const fields = { insurance: ["subscriber_number", "coverage_rate"] }
  assertEquals(findUnknownEsdRefs(nodes, fields), [{ nodeId: "o1", ref: "local.info.limit_amt", schemaName: "insurance" }])
})

Deno.test("findUnknownEsdRefs — 배열 원소 참조(${list[0].key})도 키로 본다", () => {
  const n1 = lookup("n1", "doctor", ["dept"], "local.list", "findall")
  n1.then = ["o1"]
  const nodes = [n1, output("o1", "${local.list[0].doctor_name} / ${local.list[0].nope}")]
  assertEquals(findUnknownEsdRefs(nodes, { doctor: ["dept", "doctor_name"] }), [{ nodeId: "o1", ref: "local.list[0].nope", schemaName: "doctor" }])
})

Deno.test("findUnusedLookups — 하류 어떤 멘트도 조회 결과 변수를 안 쓰면 잡는다(.length·키 참조는 사용으로 본다)", () => {
  const a = lookup("a", "s", ["k"], "local.a"); a.then = ["oa"]
  const b = lookup("b", "s", ["k"], "local.b"); b.then = ["ob"]
  const c = lookup("c", "s", ["k"], "local.c", "findall"); c.then = ["oc"]
  const nodes = [
    a, output("oa", "당일 예상 본인부담금은 조회되었습니다. 예약: ${local.appointment}"),
    b, output("ob", "보장률 ${local.b.coverage_rate}"),
    c, output("oc", "${local.c.length}건 찾았어요"),
  ]
  assertEquals(findUnusedLookups(nodes), [{ nodeId: "a", resultVar: "local.a", schemaName: "s" }])
})

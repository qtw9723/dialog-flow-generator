import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { esdSchemasToBundle } from "./esdSchemasToBundle.js"

const SCHEMA = {
  name: "배송정보",
  fields: [
    { name: "송장번호", type: "string", key: true, crypt: "false" },
    { name: "상태", type: "string", key: false, crypt: "false" },
  ],
}

Deno.test("esdSchemasToBundle: esd_schemas → { entities, apis:[] }로 감쌈", () => {
  const bundle = esdSchemasToBundle([SCHEMA])
  assertEquals(bundle.entities.length, 1)
  assertEquals(bundle.entities[0].name, "배송정보")
  assertEquals(bundle.entities[0].fields.length, 2)
  assertEquals(bundle.apis, [])
})

Deno.test("esdSchemasToBundle: 여러 스키마 순서 보존", () => {
  const bundle = esdSchemasToBundle([SCHEMA, { name: "주문정보", fields: [] }])
  assertEquals(bundle.entities.map((e) => e.name), ["배송정보", "주문정보"])
})

Deno.test("esdSchemasToBundle: null/undefined/비배열 → 빈 번들(크래시 없음)", () => {
  assertEquals(esdSchemasToBundle(null), { entities: [], apis: [] })
  assertEquals(esdSchemasToBundle(undefined), { entities: [], apis: [] })
  assertEquals(esdSchemasToBundle("x"), { entities: [], apis: [] })
})

Deno.test("esdSchemasToBundle: 잡값(객체 아님·배열) 항목 필터", () => {
  const bundle = esdSchemasToBundle([SCHEMA, null, "x", [1, 2], 42])
  assertEquals(bundle.entities.length, 1)
  assertEquals(bundle.entities[0].name, "배송정보")
})

Deno.test("esdSchemasToBundle: 빈 배열 → 빈 entities", () => {
  assertEquals(esdSchemasToBundle([]), { entities: [], apis: [] })
})

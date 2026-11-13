import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { splitApiDefs } from "./splitApiDefs.ts"

Deno.test("splitApiDefs: 배열 분할 + name/method/description 파생", () => {
  const rows = splitApiDefs([
    { name: "a", description: "가", method: "get", url: "u" },
    { name: "b", method: "post" },
  ])
  assertEquals(rows.length, 2)
  assertEquals(rows[0].name, "a")
  assertEquals(rows[0].method, "get")
  assertEquals(rows[0].description, "가")
  assertEquals(rows[0].api_def.url, "u")
  assertEquals(rows[1].description, "")
})

Deno.test("splitApiDefs: 단일 객체 → 1행", () => {
  assertEquals(splitApiDefs({ name: "x", method: "get" }).length, 1)
})

Deno.test("splitApiDefs: name 없는 원소·잘못된 입력 제외", () => {
  assertEquals(splitApiDefs([{ description: "무명" }, null, "str"]).length, 0)
  assertEquals(splitApiDefs(null).length, 0)
  assertEquals(splitApiDefs({}).length, 0)
})

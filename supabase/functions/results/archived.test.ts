import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { validateArchived } from "./archived.ts"

Deno.test("validateArchived: true·false는 통과", () => {
  assertEquals(validateArchived({ archived: true }), null)
  assertEquals(validateArchived({ archived: false }), null)
})

Deno.test("validateArchived: 불리언이 아니면 거절", () => {
  const msg = "archived must be a boolean"
  assertEquals(validateArchived({ archived: "true" }), msg)
  assertEquals(validateArchived({ archived: 1 }), msg)
  assertEquals(validateArchived({ archived: null }), msg)
  assertEquals(validateArchived({ archived: {} }), msg)
})

Deno.test("validateArchived: 키가 없으면 거절", () => {
  assertEquals(validateArchived({}), "archived must be a boolean")
})

Deno.test("validateArchived: body가 null이어도 터지지 않는다", () => {
  assertEquals(validateArchived(null), "archived must be a boolean")
  assertEquals(validateArchived(undefined), "archived must be a boolean")
})

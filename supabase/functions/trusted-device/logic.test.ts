import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts"
import { sha256Hex, computeExpiry, isExpired, emailsMatch } from "./logic.ts"

Deno.test("sha256Hex - known vector", async () => {
  // sha256("abc")
  assertEquals(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  )
})

Deno.test("sha256Hex - stable + 64 hex chars", async () => {
  const a = await sha256Hex("device-token-123")
  const b = await sha256Hex("device-token-123")
  assertEquals(a, b)
  assert(/^[0-9a-f]{64}$/.test(a))
  assert((await sha256Hex("other")) !== a)
})

Deno.test("computeExpiry - 30 days ahead by default", () => {
  const now = Date.parse("2026-06-24T00:00:00.000Z")
  assertEquals(computeExpiry(now), "2026-07-24T00:00:00.000Z")
})

Deno.test("isExpired - past expired, future not", () => {
  const now = Date.parse("2026-06-24T00:00:00.000Z")
  assert(isExpired("2026-06-23T23:59:59.000Z", now))
  assert(!isExpired("2026-06-24T00:00:01.000Z", now))
  assert(isExpired("not-a-date", now)) // 잘못된 값은 만료로 취급(안전)
})

Deno.test("emailsMatch - case/space insensitive", () => {
  assert(emailsMatch("A@B.com", " a@b.com "))
  assert(!emailsMatch("a@b.com", "c@b.com"))
})

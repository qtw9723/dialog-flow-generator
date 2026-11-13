import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { parseNodeSpecs } from "./parseSpecs.ts"

Deno.test("parseNodeSpecs: 코드펜스 JSON 배열 추출", () => {
  const text = "```json\n[{\"type\":\"output\",\"summary\":\"s\",\"isTerminal\":true,\"example\":{},\"slots\":[]}]\n```"
  const specs = parseNodeSpecs(text)
  assertEquals(specs.length, 1)
  assertEquals(specs[0].type, "output")
})
Deno.test("parseNodeSpecs: 배열 아니면 throw", () => {
  assertThrows(() => parseNodeSpecs("{\"type\":\"x\"}"), Error, "배열")
})

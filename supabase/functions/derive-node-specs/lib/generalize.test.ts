import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { generalizeToSpecs } from "./generalize.ts"
import { ExtractResult } from "./types.ts"

Deno.test("generalizeToSpecs: 추출→프롬프트→LLM→파싱, 1콜", async () => {
  const extract: ExtractResult = { output: { count: 1, example: { type: "output" }, fields: {}, description: "" } }
  let calls = 0
  const specs = await generalizeToSpecs({
    extract, descriptionsByType: {},
    callLlm: async () => { calls++; return "[{\"type\":\"output\",\"summary\":\"발화\",\"isTerminal\":true,\"example\":{},\"slots\":[]}]" },
  })
  assertEquals(calls, 1)
  assertEquals(specs[0].type, "output")
})

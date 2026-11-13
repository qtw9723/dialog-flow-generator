import { assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildGeneralizePrompt } from "./buildGeneralizePrompt.ts"
import { ExtractResult } from "./types.ts"

Deno.test("buildGeneralizePrompt: type별 path/값 샘플·설명·금지지시 포함", () => {
  const ex: ExtractResult = { output: { count: 3, example: { type: "output" }, description: "", fields: {
    "config.waitInput": { values: [false, true], types: ["boolean"] } } } }
  const p = buildGeneralizePrompt(ex, { output: "발화 노드" })
  assertStringIncludes(p, "output")
  assertStringIncludes(p, "config.waitInput")
  assertStringIncludes(p, "발화 노드")
  assertStringIncludes(p, "레퍼런스")        // 레퍼런스 밖 값 금지 지시
  assertStringIncludes(p, "user-input")     // 확장된 source 어휘
  assertStringIncludes(p, "note")           // 규칙 note 지시
  assertStringIncludes(p, "설명")            // 설명 활용 지시
})

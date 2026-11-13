import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { verifySpecs } from "./verify.ts"
import { ExtractResult, NodeSpec } from "./types.ts"

const extract: ExtractResult = {
  output: { count: 1, example: {}, description: "", fields: {
    "config.items[].type": { values: ["text", "card"], types: ["string"] },
    "config.waitInput": { values: [false], types: ["boolean"] },
  }},
}

Deno.test("verifySpecs: array<variant> 슬롯 — 추출에 없는 variant 제거(closed-world)", () => {
  const ext: ExtractResult = {
    output: { count: 1, example: {}, description: "", fields: {}, arrays: {
      "config.items": { discriminator: "type", variants: {
        text: { fields: {}, example: {} }, image: { fields: {}, example: {} },
      }},
    }},
  }
  const specs: NodeSpec[] = [{
    type: "output", summary: "", isTerminal: true, example: {}, slots: [
      { path: "config.items", kind: "array<variant>", discriminator: "type", variants: {
        text: { example: {}, slots: [] }, image: { example: {}, slots: [] }, video: { example: {}, slots: [] },  // video=환각
      }},
    ],
  }]
  const { specs: out, warnings } = verifySpecs(specs, ext)
  assertEquals(Object.keys(out[0].slots[0].variants!).sort(), ["image", "text"])  // video 제거
  assertEquals(warnings.some((w) => w.includes("video")), true)
})

Deno.test("verifySpecs: 레퍼런스에 없는 enum 값 제거", () => {
  const specs: NodeSpec[] = [{
    type: "output", summary: "", isTerminal: true, example: {}, slots: [
      { path: "config.items[].type", kind: "enum", options: ["text", "card", "video"] },  // video=환각
    ],
  }]
  const { specs: out, warnings } = verifySpecs(specs, extract)
  assertEquals(out[0].slots[0].options, ["text", "card"])   // video 제거
  assertEquals(warnings.length >= 1, true)
})

Deno.test("verifySpecs: 추출에 없는 path 슬롯 제거 + 미지 type spec 제거", () => {
  const specs: NodeSpec[] = [
    { type: "output", summary: "", isTerminal: true, example: {}, slots: [
      { path: "config.ghost", kind: "string" },                 // 없는 path
      { path: "config.waitInput", kind: "boolean" },             // 있는 path
    ]},
    { type: "ghosttype", summary: "", isTerminal: false, example: {}, slots: [] },  // 미지 type
  ]
  const { specs: out } = verifySpecs(specs, extract)
  assertEquals(out.length, 1)
  assertEquals(out[0].slots.map((s) => s.path), ["config.waitInput"])
})

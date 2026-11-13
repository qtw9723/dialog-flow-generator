import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { collectNodes, extractByType } from "./extract.ts"

Deno.test("collectNodes: dialogs[].nodes[] 및 중첩 수집", () => {
  const ref = { dialogs: [
    { id: "d1", nodes: [
      { id: "n1", type: "output", config: {} },
      { id: "n2", type: "condition", body: [ { id: "n3", type: "set" } ] },  // 중첩
    ]},
    { id: "d2", then: [] },   // nodes 없음
  ]}
  const nodes = collectNodes(ref)
  assertEquals(nodes.map((n: any) => n.id).sort(), ["n1", "n2", "n3"])
})

Deno.test("collectNodes: type 없는 객체는 노드 아님", () => {
  const ref = { dialogs: [{ nodes: [{ id: "x", label: "no-type" }] }] }
  assertEquals(collectNodes(ref).length, 0)
})

Deno.test("collectNodes: config.items[]의 type-보유 요소는 노드 아님 (nodes/body만)", () => {
  const ref = { dialogs: [{ nodes: [
    { id: "n1", type: "output", config: { items: [{ type: "text" }, { type: "card" }] } },
  ]}]}
  const nodes = collectNodes(ref)
  assertEquals(nodes.map((n: any) => n.id), ["n1"])   // item의 text/card는 제외
  assertEquals(nodes.length, 1)
})

Deno.test("extractByType: type별 path/값집합/예시/카운트", () => {
  const nodes = [
    { type: "output", config: { items: [{ type: "text" }], waitInput: false } },
    { type: "output", config: { items: [{ type: "card" }], waitInput: true } },
  ]
  const ex = extractByType(nodes)
  assertEquals(ex.output.count, 2)
  assertEquals(ex.output.fields["config.waitInput"].values.sort(), [false, true])
  // config.items는 판별 유니온 → fields가 아니라 arrays로 분기
  assertEquals(Object.keys(ex.output.arrays!["config.items"].variants).sort(), ["card", "text"])
  assertEquals(typeof ex.output.example, "object")
})

Deno.test("extractByType: 판별 유니온 — variant별 필드가 섞이지 않고 분리", () => {
  const nodes = [{ type: "output", config: { items: [
    { type: "text", text: "hi", channels: [{ name: "Web" }] },
    { type: "image", url: "u", width: 10, height: 20 },
  ]}}]
  const ex = extractByType(nodes)
  const variants = ex.output.arrays!["config.items"].variants
  assertEquals(Object.keys(variants).sort(), ["image", "text"])
  assertEquals("text" in variants.text.fields, true)        // text variant엔 text
  assertEquals("url" in variants.image.fields, true)        // image variant엔 url
  assertEquals("url" in variants.text.fields, false)        // 안 섞임
  assertEquals("text" in variants.image.fields, false)
  // 중첩 채널 등은 variant.fields의 path로 (예: channels[].name)
  assertEquals("channels[].name" in variants.text.fields, true)
})

Deno.test("extractByType: 노드 description 중 가장 풍부한 것 캡처", () => {
  const nodes = [
    { type: "api", description: "짧음" },
    { type: "api", description: "정의된 API를 연동하고 결과를 _result로 받습니다" },  // 더 풍부
    { type: "api" },  // 설명 없음
  ]
  const ex = extractByType(nodes)
  assertEquals(ex.api.description, "정의된 API를 연동하고 결과를 _result로 받습니다")
})

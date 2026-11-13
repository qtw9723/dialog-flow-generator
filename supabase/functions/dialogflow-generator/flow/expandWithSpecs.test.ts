import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { expandFlowWithSpecs, NodeSpecLite } from "./expandWithSpecs.ts"
import { FlowSpec } from "./types.ts"

// Pre/Post Dialog가 추가되므로 Main dialog를 id로 찾는다.
const mainDialog = (out: any) => out.dialogs.find((d: any) => d.id === "main")

const specs: Record<string, NodeSpecLite> = {
  output: {
    type: "output",
    isTerminal: true,
    example: {
      id: "{{id}}", type: "output", label: "{{label}}",
      config: { items: [{ type: "{{itemType}}", text: [{ texts: ["{{text}}"] }], channels: [{ use: true, name: "Web" }] }], waitInput: false },
    },
    slots: [
      { path: "config.items[].type", kind: "enum", options: ["text", "card"], default: "text" },
    ],
  },
}

const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
  { id: "n1", type: "output", intent: "인사 발화", next: [] },
]}

Deno.test("expandFlowWithSpecs: example clone + placeholder 채움 + 연결", () => {
  const out = expandFlowWithSpecs(flow, specs)
  const node = mainDialog(out).nodes[0]
  assertEquals(node.id, "n1")                              // {{id}} → flow id
  assertEquals(node.label, "인사 발화")                     // {{label}} → intent
  assertEquals(node.config.items[0].type, "text")          // {{itemType}} → 슬롯 default(closed-world)
  assertEquals(node.config.items[0].text[0].texts[0], "인사 발화")  // {{text}} → intent
  assertEquals(node.config.items[0].channels[0].name, "Web")        // 고정 보일러플레이트 보존
  assertEquals(node.config.waitInput, false)
  assertEquals(node.then, [])                              // 연결
  assertEquals(mainDialog(out).then, ["n1", "fallback"])  // 루트 + 항상 붙는 fallback
})

Deno.test("expandFlowWithSpecs: output 노드는 입력을 막지 않는다 — 스펙 example의 hideInput:true도 false로 강제", () => {
  // 레퍼런스 spec.example이 hideInput:true를 박아 둬도(예: '샘플 레스토랑'), 전 output 노드는 입력을 막으면 안 된다.
  const hideSpecs: Record<string, NodeSpecLite> = {
    output: {
      type: "output", isTerminal: true,
      example: {
        id: "{{id}}", type: "output", label: "{{label}}",
        config: { items: [{ type: "text", text: [{ texts: ["{{text}}"] }] }], hideInput: true, waitInput: false, secureOption: "" },
      },
    },
  }
  const f: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "output", intent: "날짜 요청", next: ["n2"] },
    { id: "n2", type: "output", intent: "완료 안내", next: [] },
  ]}
  const out = expandFlowWithSpecs(f, hideSpecs)
  for (const dialog of out.dialogs) {
    for (const node of dialog.nodes || []) {
      if (node.type === "output") assertEquals(node.config?.hideInput, false, `output ${node.id} 입력 막힘`)
    }
  }
})

Deno.test("expandFlowWithSpecs: scenarioName은 머신 노드로 새지 않는다 (솔루션 임포터가 미지 필드를 거부)", () => {
  const f: FlowSpec = { version: "1", entry: "s1", nodes: [
    { id: "s1", type: "output", intent: "인사", next: [], scenarioName: "배송 조회" } as any,
  ]}
  const out = expandFlowWithSpecs(f, specs)
  for (const dialog of out.dialogs) {
    for (const node of dialog.nodes || []) {
      assertEquals("scenarioName" in node, false)
    }
  }
})

Deno.test("expandFlowWithSpecs: array<variant> 슬롯 → 기본(text) variant 아이템 생성", () => {
  const vspecs: Record<string, NodeSpecLite> = {
    output: {
      type: "output", isTerminal: true,
      example: { type: "output", label: "{{label}}", config: { items: [], waitInput: false } },
      slots: [
        { path: "config.items", kind: "array<variant>", discriminator: "type", variants: {
          image: { example: { type: "image", url: "{{url}}" }, slots: [{ path: "url", kind: "string", source: "response" }] },
          text: { example: { type: "text", text: [{ texts: ["{{text}}"] }], channels: [{ use: true, name: "Web" }] }, slots: [] },
        }},
      ],
    },
  }
  const f: FlowSpec = { version: "1", entry: "n1", nodes: [{ id: "n1", type: "output", intent: "환영 인사", next: [] }] }
  const out = expandFlowWithSpecs(f, vspecs)
  const node = mainDialog(out).nodes[0]
  assertEquals(node.config.items.length, 1)              // 기본 variant 1개
  assertEquals(node.config.items[0].type, "text")        // text 우선
  assertEquals(node.config.items[0].text[0].texts[0], "환영 인사")  // intent로 채움
  assertEquals(node.config.items[0].channels[0].name, "Web")        // 고정 보일러플레이트
  assertEquals(node.config.waitInput, false)
})

Deno.test("expandFlowWithSpecs: node.variants대로 다중 item 생성 (closed-world)", () => {
  const vspecs: Record<string, NodeSpecLite> = {
    output: {
      type: "output", isTerminal: true,
      example: { type: "output", config: { items: [] } },
      slots: [
        { path: "config.items", kind: "array<variant>", discriminator: "type", variants: {
          text: { example: { type: "text", text: [{ texts: ["{{text}}"] }] }, slots: [] },
          image: { example: { type: "image", url: "{{url}}" }, slots: [{ path: "url", kind: "string", source: "response" }] },
        }},
      ],
    },
  }
  // text + image 선택, video는 슬롯에 없음 → 무시(closed-world)
  const f: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "output", intent: "안내", next: [], variants: ["text", "image", "video"] },
  ]}
  const out = expandFlowWithSpecs(f, vspecs)
  const items = mainDialog(out).nodes[0].config.items
  assertEquals(items.map((i: any) => i.type), ["text", "image"])   // video 제외
  assertEquals(items[0].text[0].texts[0], "안내")
})

Deno.test("expandFlowWithSpecs: 제네릭 리터럴 라벨도 intent로 덮어쓴다 (R1)", () => {
  // set 스펙처럼 example.label이 placeholder가 아니라 리터럴("셋")인 경우
  const litSpecs: Record<string, NodeSpecLite> = {
    set: {
      type: "set",
      example: { id: "{{id}}", type: "set", label: "셋", condition: "", description: "변수 노드" },
      slots: [{ path: "id", kind: "string" }],
    },
  }
  const f: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "set", intent: "이름 수집", next: [] },
  ]}
  const out = expandFlowWithSpecs(f, litSpecs)
  assertEquals(mainDialog(out).nodes[0].label, "이름 수집")   // "셋"이 아니라 intent
})

Deno.test("expandFlowWithSpecs: dialog.then은 루트만, 트리는 node.then으로 (뎁스)", () => {
  const branchSpecs: Record<string, NodeSpecLite> = {
    greeting: { type: "greeting", example: { id: "{{id}}", type: "greeting", label: "{{label}}" }, slots: [] },
    node: { type: "node", example: { id: "{{id}}", type: "node", label: "{{label}}", config: {} }, slots: [] },
    output: { type: "output", isTerminal: true, example: { id: "{{id}}", type: "output", label: "{{label}}", config: { items: [] } }, slots: [] },
  }
  // n1(greeting) → n2(분기) → [n3, n4]
  const f: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "greeting", intent: "환영", next: ["n2"] },
    { id: "n2", type: "node", intent: "발화 분기", next: ["n3", "n4"] },
    { id: "n3", type: "output", intent: "진료 예약", next: [] },
    { id: "n4", type: "output", intent: "예약 조회", next: [] },
  ]}
  const out = expandFlowWithSpecs(f, branchSpecs)
  assertEquals(mainDialog(out).then, ["n1", "fallback"]) // 루트(n1) + 항상 붙는 fallback (n2/n3/n4는 자식)
  assertEquals(mainDialog(out).nodes.length, 6)              // 평면 4 + fallback 2
  assertEquals(mainDialog(out).nodes[0].then, ["n2"])        // greeting → 분기
  assertEquals(mainDialog(out).nodes[1].then, ["n3", "n4"])  // 분기 → 두 갈래(하위)
})

Deno.test("expandFlowWithSpecs: Pre/Main/Post Dialog가 항상 함께 출력된다", () => {
  const out = expandFlowWithSpecs(flow, specs)
  assertEquals(out.dialogs.map((d: any) => d.name), ["Pre Dialog", "Main Dialog", "Post Dialog"])
  const post = out.dialogs.find((d: any) => d.id === "postdialog")
  assertEquals(post.then, ["error"])
  assertEquals(post.nodes[0].condition, "_error")          // 에러 핸들러
  const pre = out.dialogs.find((d: any) => d.id === "predialog")
  assertEquals(pre.nodes, [])                              // Pre는 빈 placeholder
})

Deno.test("expandFlowWithSpecs: 스펙 없는 type은 최소 노드 폴백", () => {
  const f: FlowSpec = { version: "1", entry: "x1", nodes: [{ id: "x1", type: "unknowntype", intent: "i", next: [] }] }
  const out = expandFlowWithSpecs(f, specs)
  const node = mainDialog(out).nodes[0]
  assertEquals(node.id, "x1")
  assertEquals(node.type, "unknowntype")
  assertEquals(node.then, [])
})

import { assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"

// --- 루프(subflow) materialization ---
const loopSpecs = {
  output: { type: "output", isTerminal: true, example: { type: "output", config: { items: [] } } },
  set: { type: "set", example: { type: "set", config: { items: [] } } },
}

function loopFlow(): any {
  return {
    version: "1", entry: "loop1",
    nodes: [
      { id: "loop1", type: "loop", intent: "항목 반복", next: ["done"],
        loop: { body: ["ask"], exitVar: "_user.done", max: 5 } },
      { id: "ask", type: "output", intent: "항목 요청", next: ["setflag"], variants: [] },
      { id: "setflag", type: "set", intent: "그만이면 done=true", next: [] },
      { id: "done", type: "output", intent: "완료", next: [] },
    ],
  }
}

const lmain = (j: any) => j.dialogs.find((d: any) => d.id === "main")
const lById = (j: any, id: string) => lmain(j).nodes.find((n: any) => n.id === id)

Deno.test("expand: loop 노드가 subflow로 변환된다", () => {
  const j = expandFlowWithSpecs(loopFlow(), loopSpecs as any)
  const sub = lById(j, "loop1")
  assertEquals(sub.type, "subflow")
  assertEquals(sub.body, ["ask"])
  assertEquals(sub.then, ["done"])
  assertEquals(sub.config.loop.condition, "_user.done")  // 기본 truthy(레퍼런스 관용)
  assertEquals(sub.config.loop.count, "5")
})

Deno.test("expand: 본문 진입 노드(ask)는 main.then 루트에서 제외", () => {
  const j = expandFlowWithSpecs(loopFlow(), loopSpecs as any)
  assert(!lmain(j).then.includes("ask"), "ask는 루트가 아니어야 함")
})

Deno.test("expand: autoInitFlag 기본=true면 init-set이 주입되고 루프를 가리킨다", () => {
  const j = expandFlowWithSpecs(loopFlow(), loopSpecs as any)
  const init = lmain(j).nodes.find((n: any) => n.type === "set" && n.id.endsWith("__init"))
  assert(init, "init-set 주입돼야 함")
  assertEquals(init.config.items[0].key, "_user.done")
  assertEquals(init.config.items[0].value, "false")
  assertEquals(init.then, ["loop1"])
  assert(lmain(j).then.includes(init.id), "init이 루트")
  assert(!lmain(j).then.includes("loop1"), "loop은 더 이상 루트가 아님(init이 인계)")
})

Deno.test("expand: 루프에 이미 부모가 있으면 init이 단일 부모가 되도록 재배선", () => {
  const f = loopFlow()
  // LLM이 루프를 비루트로 설계(enter가 loop1을 next로 가리킴). init 주입이 부모를 2개로
  // 만들지 않도록, 기존 참조를 init으로 재배선해 loop의 부모는 init 하나여야 한다.
  f.nodes.unshift({ id: "enter", type: "output", intent: "진입", next: ["loop1"] })
  f.entry = "enter"
  const j = expandFlowWithSpecs(f, loopSpecs as any)
  assertEquals(lById(j, "enter").then, ["loop1__init"])  // loop1 직접참조 → init으로
  const parents = lmain(j).nodes.filter((n: any) => (n.then || []).includes("loop1"))
  assertEquals(parents.map((n: any) => n.id), ["loop1__init"])  // 부모는 init 하나뿐
})

Deno.test("expand: autoInitFlag=false면 init-set 미주입, loop이 루트", () => {
  const j = expandFlowWithSpecs(loopFlow(), loopSpecs as any, { loopBehavior: { exitCompare: "== true", autoInitFlag: false, defaultMax: 10 } })
  assertEquals(lmain(j).nodes.some((n: any) => n.id.endsWith("__init")), false)
  assert(lmain(j).then.includes("loop1"))
})

Deno.test("expand: max 미지정 시 defaultMax 사용", () => {
  const f = loopFlow(); f.nodes[0].loop.max = undefined
  const j = expandFlowWithSpecs(f, loopSpecs as any)
  assertEquals(lById(j, "loop1").config.loop.count, "10")
})

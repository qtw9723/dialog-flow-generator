import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { validateFlow, ensureGreeting } from "./validateFlow.ts"
import { NodeCatalogEntry, FlowSpec } from "./types.ts"

const catalog: NodeCatalogEntry[] = [
  { type: "Condition", label: "Condition", description: "", promptInstruction: "", isTerminal: false },
  { type: "Output", label: "Output", description: "", promptInstruction: "", isTerminal: true },
  { type: "stack", label: "스택", description: "흐름 조작", promptInstruction: "", isTerminal: false },
  { type: "greeting", label: "웰컴", description: "", promptInstruction: "", isTerminal: false },
]

Deno.test("validateFlow: 정상 플로우는 valid", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Condition", intent: "", next: ["n2"] },
    { id: "n2", type: "Output", intent: "", next: [] },
  ]}
  assertEquals(validateFlow(flow, catalog).valid, true)
})

Deno.test("validateFlow: 미지 노드 종류 → invalid", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Ghost", intent: "", next: [] },
  ]}
  const r = validateFlow(flow, catalog)
  assertEquals(r.valid, false)
})

Deno.test("validateFlow: 끊긴 next 참조 → invalid", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Condition", intent: "", next: ["nX"] },
  ]}
  assertEquals(validateFlow(flow, catalog).valid, false)
})

Deno.test("validateFlow: 종결 노드 없음 → invalid", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Condition", intent: "", next: ["n1"] },
  ]}
  assertEquals(validateFlow(flow, catalog).valid, false)
})

Deno.test("validateFlow: entry가 노드에 없음 → invalid", () => {
  const flow: FlowSpec = { version: "1", entry: "zzz", nodes: [
    { id: "n1", type: "Output", intent: "", next: [] },
  ]}
  assertEquals(validateFlow(flow, catalog).valid, false)
})

import { repairFlow } from "./validateFlow.ts"

Deno.test("validateFlow: 다중 루트(형제 시나리오) 허용 — valid", () => {
  // 무입력 노드 둘 = 두 개의 최상위 엔트리(greeting + 시나리오). 둘 다 루트라 valid.
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Output", intent: "인사", next: [] },
    { id: "n2", type: "Condition", intent: "시나리오 진입", next: ["n3"] },
    { id: "n3", type: "Output", intent: "처리", next: [] },
  ]}
  assertEquals(validateFlow(flow, catalog).valid, true)
})

Deno.test("validateFlow: 소스 없는 순환에 갇힌 노드 → invalid(고아)", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Output", intent: "", next: [] },        // 루트 종결
    { id: "n2", type: "Condition", intent: "", next: ["n3"] }, // n2↔n3 순환, 둘 다 참조됨=소스 아님
    { id: "n3", type: "Condition", intent: "", next: ["n2"] },
  ]}
  assertEquals(validateFlow(flow, catalog).valid, false)
})

Deno.test("validateFlow: 도달 가능한 종결 없음 → invalid", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Condition", intent: "", next: ["n2"] },
    { id: "n2", type: "Condition", intent: "", next: ["n1"] },  // 순환, 종결(Output) 없음
  ]}
  assertEquals(validateFlow(flow, catalog).valid, false)
})

Deno.test("repairFlow: 소스 없는 순환 고아 제거, 다중 루트는 보존", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Condition", intent: "", next: ["n2"] },
    { id: "n2", type: "Output", intent: "", next: [] },
    { id: "n3", type: "Output", intent: "두 번째 루트", next: [] },  // 무입력=루트 → 보존
    { id: "n4", type: "Condition", intent: "", next: ["n5"] },        // n4↔n5 소스없는 순환 → 제거
    { id: "n5", type: "Condition", intent: "", next: ["n4"] },
  ]}
  const { flow: fixed, repaired } = repairFlow(flow, catalog)
  assertEquals(repaired, true)
  assertEquals(fixed.nodes.map((n) => n.id).sort(), ["n1", "n2", "n3"])  // n4/n5 제거, n3 루트 보존
  assertEquals(validateFlow(fixed, catalog).valid, true)
})

Deno.test("repairFlow: 시나리오 루트가 stack이면 제거하고 자식을 진입점(루트)으로 승격", () => {
  // stack은 흐름 조작(저장/처음으로/뒤로/복원) 전용 — 시나리오 진입에 쓰면 안 된다.
  // n2(stack)가 진입점으로 잘못 설계됨 → 제거, 자식 n3가 새 루트가 되어 트리거 condition을 받는다.
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "greeting", intent: "인사", next: [] },
    { id: "n2", type: "stack", intent: "예약 시나리오 시작", next: ["n3"] },  // 루트 stack(잘못)
    { id: "n3", type: "Output", intent: "이름 요청", next: [] },
  ]}
  const { flow: fixed, repaired } = repairFlow(flow, catalog)
  assertEquals(repaired, true)
  assertEquals(fixed.nodes.map((n) => n.id).sort(), ["n1", "n3"])  // n2(stack) 제거
  assertEquals(validateFlow(fixed, catalog).valid, true)
})

Deno.test("repairFlow: 흐름 조작 stack(자식 없는 잎)·자식 있는 비루트 stack은 보존", () => {
  // 진입/분기 stack만 문제다. 자식 없는 stack(예: '처음으로' 버튼)이나 흐름 중간 stack은 건드리지 않는다.
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Condition", intent: "", next: ["n2", "n3"] },
    { id: "n2", type: "Output", intent: "", next: [] },
    { id: "n3", type: "stack", intent: "처음으로", next: [] },  // 잎 stack → 보존
  ]}
  const { flow: fixed, repaired } = repairFlow(flow, catalog)
  assertEquals(repaired, false)
  assertEquals(fixed.nodes.map((n) => n.id).sort(), ["n1", "n2", "n3"])
})

Deno.test("repairFlow: 미지 노드 제거 + 끊긴 next 정리", () => {
  const flow: FlowSpec = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "Condition", intent: "", next: ["n2", "nX"] },
    { id: "n2", type: "Output", intent: "", next: [] },
    { id: "n3", type: "Ghost", intent: "", next: [] },
  ]}
  const { flow: fixed, repaired } = repairFlow(flow, catalog)
  assertEquals(repaired, true)
  assertEquals(fixed.nodes.length, 2)                       // Ghost 제거
  assertEquals(fixed.nodes[0].next, ["n2"])                 // nX 제거
  assertEquals(validateFlow(fixed, catalog).valid, true)
})

Deno.test("ensureGreeting: greeting 없으면 인사말 greeting+output을 루트로 주입", () => {
  const flow: FlowSpec = { version: "1", entry: "s1", nodes: [
    { id: "s1", type: "Output", intent: "진료 예약 시작·이름 요청", next: [] },
  ]}
  const { flow: out, injected } = ensureGreeting(flow)
  assertEquals(injected, true)
  const greeting = out.nodes.find((n) => n.type === "greeting")
  assertEquals(!!greeting, true)                                 // greeting 주입됨
  assertEquals(greeting!.next.length, 1)                         // 인사말 output 하나
  const greet = out.nodes.find((n) => n.id === greeting!.next[0])
  assertEquals(greet?.type, "output")                           // 그 아래는 output
  assertEquals(greet?.next, [])                                 // 인사말은 종결
  // 기존 시나리오 노드는 보존, greeting은 그 노드의 자식이 아니다(루트 형제)
  assertEquals(out.nodes.some((n) => n.id === "s1"), true)
  assertEquals(out.nodes.some((n) => n.next.includes(greeting!.id)), false)
})

Deno.test("ensureGreeting: 이미 greeting 있으면 그대로(중복 주입 없음)", () => {
  const flow: FlowSpec = { version: "1", entry: "w1", nodes: [
    { id: "w1", type: "greeting", intent: "인사", next: ["w2"] },
    { id: "w2", type: "Output", intent: "안녕하세요", next: [] },
    { id: "s1", type: "Output", intent: "예약", next: [] },
  ]}
  const { flow: out, injected } = ensureGreeting(flow)
  assertEquals(injected, false)
  assertEquals(out.nodes.filter((n) => n.type === "greeting").length, 1)  // 그대로 1개
  assertEquals(out.nodes.length, 3)
})

import { assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"

// --- 루프(subflow) 검증/복구 ---
const loopCat = [
  { type: "output", label: "Output", description: "", promptInstruction: "", isTerminal: true },
  { type: "set", label: "Set", description: "", promptInstruction: "", isTerminal: false },
  { type: "loop", label: "Loop", description: "", promptInstruction: "", isTerminal: false },
]

function goodLoop(): any {
  return {
    version: "1", entry: "loop1",
    nodes: [
      { id: "loop1", type: "loop", intent: "반복", next: ["done"], loop: { body: ["ask"], exitVar: "_user.done", max: 5 } },
      { id: "ask", type: "output", intent: "요청", next: ["setflag"] },
      { id: "setflag", type: "set", intent: "done=true", next: [] },
      { id: "done", type: "output", intent: "완료", next: [] },
    ],
  }
}

Deno.test("validate: 본문(loop.body) 노드는 도달가능 — 고아 아님", () => {
  const res = validateFlow(goodLoop(), loopCat as any)
  assertEquals(res.errors.filter((e) => e.includes("고아")), [])
  assertEquals(res.valid, true)
})

Deno.test("validate: loop.body 비면 오류", () => {
  const f = goodLoop(); f.nodes[0].loop.body = []
  const res = validateFlow(f, loopCat as any)
  assert(res.errors.some((e) => e.includes("본문") || e.includes("body")))
})

Deno.test("validate: exitVar 비면 오류", () => {
  const f = goodLoop(); f.nodes[0].loop.exitVar = ""
  const res = validateFlow(f, loopCat as any)
  assert(res.errors.some((e) => e.includes("exitVar") || e.includes("탈출")))
})

Deno.test("validate: 본문에 exitVar set 노드 없으면 오류(무한루프 방지)", () => {
  const f = goodLoop()
  f.nodes = f.nodes.filter((n: any) => n.id !== "setflag")
  f.nodes.find((n: any) => n.id === "ask").next = []
  const res = validateFlow(f, loopCat as any)
  assert(res.errors.some((e) => e.includes("set") || e.includes("탈출")))
})

Deno.test("repair: loop.body 끊긴 참조 제거 후 본문 비면 루프 노드 제거", () => {
  const f = goodLoop()
  f.nodes[0].loop.body = ["nonexistent"]
  f.nodes = f.nodes.filter((n: any) => n.id !== "ask")
  const { flow, repaired } = repairFlow(f, loopCat as any)
  assertEquals(repaired, true)
  assertEquals(flow.nodes.some((n) => n.id === "loop1"), false)
})

// 회귀: LLM이 본문 첫 노드(loop.body 루트)로 되돌아가는 next(루프백)를 넣으면, 펼친 트리에서
// 그 노드의 부모가 둘이 되고 사이클이 생겨 에디터가 main을 로드하지 못한다(라이브 캡처 재현).
// 본문 진입은 loop.body로만 — repair가 본문 루트로 향하는 next를 결정론적으로 제거해야 한다.
Deno.test("repair: 본문 루트로 되돌아가는 next(루프백) 제거 — 트리 불변식", () => {
  const f = goodLoop()
  f.nodes.find((n: any) => n.id === "setflag").next = ["ask"]  // setflag → ask 루프백
  const { flow, repaired } = repairFlow(f, loopCat as any)
  assertEquals(repaired, true)
  const setflag = flow.nodes.find((n) => n.id === "setflag")!
  assertEquals(setflag.next, [])                       // 루프백 제거
  assert(flow.nodes.some((n) => n.id === "ask"))        // ask는 loop.body로 여전히 도달 → 고아 아님
})

// 회귀: LLM이 본문 노드를 루프 continuation(loop.next)으로 직접 흘려보내면(fall-through),
// 펼친 트리에서 그 continuation 노드의 부모가 둘이 된다(본문 + loop.then) → 로드 실패(라이브 706605c1 재현).
// 본문은 self-contained subtree여야 하고, 탈출은 루프 기구로만 — 본문 밖으로 나가는 next를 제거.
// 회귀: LLM이 분기 후 재합류(diamond)나 shortcut을 만들면 재합류 노드의 부모가 둘이 된다.
// DialogFlow는 dialog를 '트리'로 렌더(프로덕션 레퍼런스도 전 노드 부모 1개) → 다중부모면 로드 실패(라이브 1ffafa2c 재현).
// 루트에서 신장트리를 뽑아 잉여 부모 엣지(재합류·shortcut)를 제거, 단 모든 노드는 도달 가능 유지.
const diaCat = [
  { type: "node", label: "N", description: "", promptInstruction: "", isTerminal: false },
  { type: "output", label: "O", description: "", promptInstruction: "", isTerminal: true },
  { type: "set", label: "S", description: "", promptInstruction: "", isTerminal: false },
]
Deno.test("repair: 분기 후 재합류(diamond) → 재합류 노드 부모 1개 (트리 불변식)", () => {
  const f = { version: "1", entry: "a", nodes: [
    { id: "a", type: "node", intent: "분기", next: ["b", "d"] },   // a → b, d (shortcut)
    { id: "b", type: "set", intent: "작업", next: ["c"] },
    { id: "c", type: "set", intent: "작업2", next: ["d"] },          // b→c→d 가 d로 재합류
    { id: "d", type: "output", intent: "완료", next: [] },
  ] }
  const { flow, repaired } = repairFlow(f as any, diaCat as any)
  assertEquals(repaired, true)
  const parents = flow.nodes.filter((n) => (n.next || []).includes("d"))
  assertEquals(parents.length, 1)                                   // d 부모 하나뿐
  assertEquals(flow.nodes.map((n) => n.id).sort(), ["a", "b", "c", "d"])  // 고아 없음(전부 보존)
})

Deno.test("repair: 본문이 continuation으로 새어나가는 next(fall-through) 제거", () => {
  const f = goodLoop()  // loop1(body=[ask], next=[done]); ask→setflag→[]
  // setflag가 본문을 끝내지 않고 continuation(done)으로 직접 감 = fall-through
  f.nodes.find((n: any) => n.id === "setflag").next = ["done"]
  const { flow, repaired } = repairFlow(f, loopCat as any)
  assertEquals(repaired, true)
  const setflag = flow.nodes.find((n) => n.id === "setflag")!
  assertEquals(setflag.next, [])                       // continuation으로의 fall-through 제거
  // done은 loop1.next(=then)로만 도달 → 부모 1개
  const parents = flow.nodes.filter((n) => (n.next || []).includes("done"))
  assertEquals(parents.map((n) => n.id), ["loop1"])
})

// 회귀: loop 필드 없는 type:"loop" 노드가 제거될 때, 그를 가리키던 next가 dangling으로 남아
// FLOW_INVALID이 나던 버그(라이브 캡처 재현). repair는 끊긴 참조까지 정리해 valid를 내야 한다.
const dbgCat = [
  { type: "greeting", label: "W", description: "", promptInstruction: "", isTerminal: false },
  { type: "output", label: "O", description: "", promptInstruction: "", isTerminal: true },
  { type: "node", label: "N", description: "", promptInstruction: "", isTerminal: false },
  { type: "set", label: "S", description: "", promptInstruction: "", isTerminal: false },
  { type: "loop", label: "L", description: "", promptInstruction: "", isTerminal: false },
]
Deno.test("repair: loop 필드 없는 loop 노드 제거 후 그 노드 가리키던 next도 정리(FLOW_INVALID 회귀)", () => {
  const flow: any = { version: "1", entry: "n1", nodes: [
    { id: "n1", type: "greeting", intent: "", next: ["n2"] },
    { id: "n2", type: "output", intent: "", next: [] },
    { id: "n3", type: "node", intent: "", next: ["n4"] },
    { id: "n4", type: "loop", intent: "", next: ["n7"] },   // loop 필드 없음 → 제거 대상
    { id: "n5", type: "output", intent: "", next: ["n6"] },
    { id: "n6", type: "set", intent: "", next: ["n8"] },
    { id: "n7", type: "output", intent: "", next: [] },
    { id: "n8", type: "node", intent: "", next: ["n5"] },   // n5↔n6↔n8 외부진입 없는 순환
    { id: "n9", type: "set", intent: "", next: [] },
  ]}
  const { flow: fixed } = repairFlow(flow, dbgCat as any)
  const ids = new Set(fixed.nodes.map((n: any) => n.id))
  for (const n of fixed.nodes) for (const nx of n.next) {
    assert(ids.has(nx), `끊긴 참조 남음: ${n.id}->${nx}`)
  }
  assertEquals(validateFlow(fixed, dbgCat as any).valid, true)
})

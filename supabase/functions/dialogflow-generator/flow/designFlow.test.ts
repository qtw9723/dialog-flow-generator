import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { designFlow } from "./designFlow.ts"
import { NodeCatalogEntry } from "./types.ts"

const catalog: NodeCatalogEntry[] = [
  { type: "Condition", label: "Condition", description: "", promptInstruction: "", isTerminal: false },
  { type: "Output", label: "Output", description: "", promptInstruction: "", isTerminal: true },
]
const validFlowJson = JSON.stringify({ version: "1", entry: "n1", nodes: [
  { id: "n1", type: "Condition", intent: "", next: ["n2"] },
  { id: "n2", type: "Output", intent: "", next: [] },
]})

Deno.test("designFlow: 유효 플로우 1콜로 반환", async () => {
  let calls = 0
  const { flow, llmCalls } = await designFlow({
    responsesByRole: {}, catalog, ruleSummary: "",
    callLlm: async () => { calls++; return validFlowJson },
  })
  assertEquals(flow.entry, "n1")
  assertEquals(llmCalls, 1)
  assertEquals(calls, 1)
})

Deno.test("designFlow: 보정 불가 위반 시 1회 재요청", async () => {
  // 1차: entry가 노드에 없음(보정 불가) → 2차: 유효
  const badJson = JSON.stringify({ version: "1", entry: "zzz", nodes: [
    { id: "n1", type: "Output", intent: "", next: [] },
  ]})
  let calls = 0
  const { flow, llmCalls } = await designFlow({
    responsesByRole: {}, catalog, ruleSummary: "",
    callLlm: async () => { calls++; return calls === 1 ? badJson : validFlowJson },
  })
  assertEquals(llmCalls, 2)
  assertEquals(flow.entry, "n1")
})

// 데모: 생성 파이프라인의 "결정론 구간"을 실제 소스 그대로 실행한다.
// LLM 호출 2번(설계·재설계)은 아래 스크립트된 응답으로 대신한다 — 실운영이 아니다.
// 실행: deno run --allow-write demo/run-demo.ts   (결과: demo/recorded/run.json)
import { FlowSpec, NodeCatalogEntry } from "../supabase/functions/dialogflow-generator/flow/types.ts"
import { validateFlow, repairFlow, ensureGreeting } from "../supabase/functions/dialogflow-generator/flow/validateFlow.ts"
import { expandFlowWithSpecs, NodeSpecLite } from "../supabase/functions/dialogflow-generator/flow/expandWithSpecs.ts"

const REQUIREMENT = "택배 반품 접수 챗봇 — 운송장 번호를 받아 반품 가능 여부를 조회하고, 사유를 최대 3번까지 물어 접수한다."

const catalog: NodeCatalogEntry[] = [
  { type: "greeting", label: "인사", description: "", promptInstruction: "", isTerminal: false },
  { type: "input", label: "입력", description: "", promptInstruction: "", isTerminal: false },
  { type: "set", label: "변수 저장", description: "", promptInstruction: "", isTerminal: false },
  { type: "api", label: "API 호출", description: "", promptInstruction: "", isTerminal: false },
  { type: "loop", label: "반복", description: "", promptInstruction: "", isTerminal: false },
  { type: "output", label: "멘트", description: "", promptInstruction: "", isTerminal: true },
]

const spec = (type: string, config: Record<string, unknown>, isTerminal = false): NodeSpecLite => ({
  type, isTerminal, example: { id: "", type, label: "", config, then: [] },
})
const specs: Record<string, NodeSpecLite> = {
  greeting: spec("greeting", {}),
  input: spec("input", { variable: "{{id}}_value", prompt: "{{text}}" }),
  set: spec("set", { variable: "{{id}}", value: "" }),
  api: spec("api", { url: "/api/{{id}}", method: "POST" }),
  output: spec("output", { items: [{ type: "text", text: "{{text}}" }] }, true),
}

// ── [LLM·스크립트] 1차 설계: 결함 3개(미지 노드 종류 / 끊긴 참조 / 탈출 변수를 못 만드는 루프) ──
const design1: FlowSpec = {
  version: "1", entry: "n1",
  nodes: [
    { id: "n1", type: "input", intent: "운송장 번호 입력", next: ["n2"] },
    { id: "n2", type: "api", intent: "반품 가능 여부 조회", next: ["n3", "ghost"] },
    { id: "n3", type: "loop", intent: "반품 사유 재시도", next: ["n5"], loop: { body: ["n4"], exitVar: "reason_ok", max: 3 } },
    { id: "n4", type: "input", intent: "반품 사유 입력", next: [] },
    { id: "n5", type: "output", intent: "접수 완료 안내", next: [] },
    { id: "n6", type: "teleport", intent: "택배기사 즉시 호출", next: ["n5"] },
  ],
}

// ── [LLM·스크립트] 2차 설계: 검증 오류를 피드백으로 받아 루프 본문에 탈출 변수 set 노드를 추가 ──
const design2: FlowSpec = {
  version: "1", entry: "n1",
  nodes: [
    { id: "n1", type: "input", intent: "운송장 번호 입력", next: ["n2"] },
    { id: "n2", type: "api", intent: "반품 가능 여부 조회", next: ["n3"] },
    { id: "n3", type: "loop", intent: "반품 사유 재시도", next: ["n5"], loop: { body: ["n4"], exitVar: "reason_ok", max: 3 } },
    { id: "n4", type: "input", intent: "반품 사유 입력", next: ["n4b"] },
    { id: "n4b", type: "set", intent: "사유 확인 완료 표시", next: [] },
    { id: "n5", type: "output", intent: "접수 완료 안내", next: [] },
  ],
}

const lite = (f: FlowSpec) => f.nodes.map((n) => ({ id: n.id, type: n.type, intent: n.intent, next: n.next }))
const rec: Record<string, unknown> = { requirement: REQUIREMENT }

rec.design1 = lite(design1)
const v1 = validateFlow(design1, catalog)
rec.validate1 = v1

const rep = repairFlow(design1, catalog)
const v1b = validateFlow(rep.flow, catalog)
rec.repair = {
  repaired: rep.repaired,
  removed: design1.nodes.filter((n) => !rep.flow.nodes.some((m) => m.id === n.id)).map((n) => n.id),
  danglingFixed: design1.nodes.some((n) => n.next.includes("ghost")) && !rep.flow.nodes.some((n) => n.next.includes("ghost")),
  after: v1b,
}

rec.design2 = lite(design2)
const v2 = validateFlow(design2, catalog)
rec.validate2 = v2

const g = ensureGreeting(design2)
rec.greeting = { injected: g.injected, ids: g.flow.nodes.slice(0, 2).map((n) => n.id) }
const v3 = validateFlow(g.flow, catalog)
rec.validate3 = v3

const out = expandFlowWithSpecs(g.flow, specs, { name: "택배 반품 접수" })
const dialogs: any[] = out.dialogs || []
const nodes: any[] = dialogs.flatMap((d) => d.nodes || [])
const typeCount: Record<string, number> = {}
for (const n of nodes) typeCount[n.type] = (typeCount[n.type] || 0) + 1
const ids = nodes.map((n) => n.id)
const dangling = nodes.flatMap((n) => (n.then || []).filter((t: string) => !ids.includes(t)))
rec.expand = {
  dialogs: dialogs.length, nodes: nodes.length, typeCount,
  uniqueIds: new Set(ids).size === ids.length, dangling,
  sample: nodes.find((n) => n.id === "n2"),
  loopNode: nodes.find((n) => n.type === "subflow"),
}

if (!v1.valid || v1b.valid || !v2.valid || !v3.valid || dangling.length) {
  // v1 무효 · 보정 후에도 무효(루프 결함은 코드가 못 고침) · 재설계 후 유효 — 시나리오 불변식
  if (v1.valid || !v1b.errors.length || !v2.valid || !v3.valid || dangling.length) {
    console.error(JSON.stringify(rec, null, 1)); Deno.exit(1)
  }
}
await Deno.mkdir("demo/recorded", { recursive: true })
await Deno.writeTextFile("demo/recorded/bot.json", JSON.stringify({ bot: out, flow: g.flow }, null, 1))
await Deno.writeTextFile("demo/recorded/run.json", JSON.stringify(rec, null, 1))
console.log("데모 통과 — demo/recorded/run.json")
console.log(JSON.stringify({ v1: v1.errors, afterRepair: v1b.errors, v2: v2.valid, expand: rec.expand && (rec.expand as any).typeCount }, null, 1))

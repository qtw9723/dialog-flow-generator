// 노드 타입 커버리지 점검 — "우리가 정의하지 못한 노드"를 찾는다.
//
//   deno run --allow-read --allow-env --allow-net scripts/node-type-coverage.ts
//
// ⚠ 함정: dialog JSON에는 `type` 필드가 **두 층**에 있다.
//   ① 노드      dialogs[].nodes[]  (+ body[]가 객체일 때)
//   ② config 항목 output.config.items[].type 등 — `text`·`postback`·`html`·`carousel`…
// 둘을 섞어 세면 노드 종류가 실제의 2배 넘게 부풀어 오른다(2026-08-28에 실제로 그랬다).
// 이 스크립트는 **노드 레벨만** 센다.
import { nodeTypeInfo, isEditableType } from "../src/lib/flow/nodeTypeRegistry.js"

const FIXTURES = ["node-sample", "llm-sample"]

function nodeTypes(flow: any): Map<string, number> {
  const c = new Map<string, number>()
  const bump = (t: unknown) => {
    if (typeof t !== "string" || !t) return
    c.set(t, (c.get(t) || 0) + 1)
  }
  for (const d of flow?.dialogs || []) {
    for (const n of d?.nodes || []) {
      bump(n?.type)
      for (const b of n?.body || []) if (b && typeof b === "object") bump((b as any).type)
    }
  }
  return c
}

function configItemTypes(flow: any): Set<string> {
  const s = new Set<string>()
  const walk = (x: any) => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (x && typeof x === "object") {
      if (typeof x.type === "string") s.add(x.type)
      Object.values(x).forEach(walk)
    }
  }
  for (const d of flow?.dialogs || []) for (const n of d?.nodes || []) walk(n?.config)
  return s
}

const total = new Map<string, number>()
const items = new Set<string>()
for (const f of FIXTURES) {
  const flow = JSON.parse(await Deno.readTextFile(`docs/superpowers/fixtures/bots/${f}.json`))
  for (const [t, n] of nodeTypes(flow)) total.set(t, (total.get(t) || 0) + n)
  for (const t of configItemTypes(flow)) items.add(t)
}

const sorted = [...total.entries()].sort((a, b) => b[1] - a[1])
console.log(`노드 타입 ${sorted.length}종 (fixture ${FIXTURES.length}봇)\n`)
console.log(`${"타입".padEnd(16)}${"개수".padStart(6)}  편집  라벨`)
console.log("-".repeat(40))
for (const [t, n] of sorted) {
  const info = nodeTypeInfo(t)
  const labeled = info.label !== t ? "✅" : "❌"
  console.log(`${t.padEnd(16)}${String(n).padStart(6)}   ${isEditableType(t) ? "✅" : "—"}    ${labeled}`)
}
const unlabeled = sorted.filter(([t]) => nodeTypeInfo(t).label === t).map(([t]) => t)
console.log(`\n편집 가능 ${sorted.filter(([t]) => isEditableType(t)).length}종 · 잠김 ${sorted.filter(([t]) => !isEditableType(t)).length}종`)
console.log(unlabeled.length ? `⚠ 라벨 없는 노드 타입: ${unlabeled.join(", ")}` : "✅ 모든 노드 타입에 라벨이 있다")
console.log(`\n(참고) config 항목 타입 ${items.size}종 — 노드가 아니다: ${[...items].sort().join(", ")}`)

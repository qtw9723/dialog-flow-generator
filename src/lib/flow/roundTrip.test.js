// v0.9.0 왕복 무손실 회귀 — 실제 솔루션 봇 fixture 기준.
//
// 기존 canvasToFlow.test.js의 "AC1 왕복 불변"은 합성 flow로만 확인한다.
// 업로드 봇은 편집기가 없는 노드 타입(21종 중 14종)과 미지 필드를 갖고 오므로 별도로 못박는다.
// ⚠ 이 테스트가 깨지면 편집 UI를 붙이면 안 된다 — 사고가 사용자 봇으로 간다.
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { canvasToFlow } from './canvasToFlow.js'
import { deriveStructure } from '../refDiagram.js'
import { isEditableType } from './nodeTypeRegistry.js'

const FIXTURES = ['node-sample', 'llm-sample']
const load = async (n) => JSON.parse(await Deno.readTextFile(`docs/superpowers/fixtures/bots/${n}.json`))

function toCanvas(flow) {
  const { nodes, edges } = deriveStructure(flow)
  return {
    nodes: nodes.map((n) => ({ id: n.id, data: { type: n.type, label: n.label } })),
    edges: edges.map((e) => ({ source: e.from, target: e.to })),
  }
}

const nodesOf = (flow) => {
  const out = new Map()
  for (const d of flow?.dialogs || []) for (const n of d?.nodes || []) out.set(`${d.id}/${n.id}`, n)
  return out
}

// ── ① 무편집 왕복 ──────────────────────────────────────────────────────────

for (const name of FIXTURES) {
  Deno.test(`무손실 ①: ${name} — 편집 없이 왕복하면 원본과 동일`, async () => {
    const flow = await load(name)
    const before = JSON.stringify(flow)
    const result = canvasToFlow(flow, toCanvas(flow))
    assertEquals(JSON.stringify(result), before)
    // 입력 불변도 함께 — canvasToFlow가 원본을 건드리면 호출부가 조용히 오염된다.
    assertEquals(JSON.stringify(flow), before)
  })
}

// ── ② 한 노드만 편집 ───────────────────────────────────────────────────────

for (const name of FIXTURES) {
  Deno.test(`무손실 ②: ${name} — 한 노드 라벨만 바꾸면 나머지는 전부 동일`, async () => {
    const flow = await load(name)
    const canvas = toCanvas(flow)
    // 편집 가능한 노드 하나를 고른다(레지스트리 기준). 없으면 이 fixture는 건너뛴다.
    const target = canvas.nodes.find((n) => isEditableType(n.data?.type))
    if (!target) return
    const edited = {
      ...canvas,
      nodes: canvas.nodes.map((n) => (n.id === target.id ? { ...n, data: { ...n.data, label: '__편집됨__' } } : n)),
    }
    const result = canvasToFlow(flow, edited)

    const before = nodesOf(flow)
    const after = nodesOf(result)
    assertEquals(after.size, before.size, '노드 수가 바뀌면 안 된다')
    let changed = 0
    for (const [key, b] of before) {
      const a = after.get(key)
      if (JSON.stringify(a) === JSON.stringify(b)) continue
      changed++
      assertEquals(key.endsWith(`/${target.id}`), true, `편집 대상이 아닌 노드가 바뀌었다: ${key}`)
    }
    assertEquals(changed <= 1, true, `바뀐 노드가 ${changed}개다`)
  })
}

// ── ③ 미지 노드의 필드 보존 (핵심) ──────────────────────────────────────────

for (const name of FIXTURES) {
  Deno.test(`무손실 ③: ${name} — 편집 불가 타입 노드는 필드가 하나도 안 사라진다`, async () => {
    const flow = await load(name)
    const canvas = toCanvas(flow)
    const target = canvas.nodes.find((n) => isEditableType(n.data?.type))
    const edited = target
      ? { ...canvas, nodes: canvas.nodes.map((n) => (n.id === target.id ? { ...n, data: { ...n.data, label: 'x' } } : n)) }
      : canvas
    const result = canvasToFlow(flow, edited)

    const before = nodesOf(flow)
    const after = nodesOf(result)
    for (const [key, b] of before) {
      if (isEditableType(b?.type)) continue
      const a = after.get(key)
      assertEquals(a !== undefined, true, `잠긴 노드가 사라졌다: ${key} (${b?.type})`)
      assertEquals(JSON.stringify(a), JSON.stringify(b), `잠긴 노드가 변형됐다: ${key} (${b?.type})`)
    }
  })
}

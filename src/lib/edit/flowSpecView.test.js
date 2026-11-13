import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { toFlowSpecView, applyRepairedView } from "./flowSpecView.js"
import { validateFlow, repairFlow } from "../../../supabase/functions/dialogflow-generator/flow/validateFlow.ts"

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

/** 테스트마다 독립된 deep copy 반환 */
function makeFlow() {
  return {
    id: 'flow1',
    name: '테스트 플로우',
    dialogs: [
      {
        id: 'greeting',
        then: ['w1'],
        nodes: [
          { id: 'w1', type: 'output', label: '인사', config: {}, then: ['s1'] },
        ],
      },
      {
        id: 'scenario1',
        then: ['s1'],
        nodes: [
          { id: 's1', type: 'input', label: '입력1', config: {}, then: ['s2'] },
          { id: 's2', type: 'output', label: '결과', config: {}, then: [] },
        ],
      },
    ],
  }
}

// ── AC1: 왕복 불변 ────────────────────────────────────────────────────────────

Deno.test("AC1: 정상 머신트리 → toFlowSpecView → applyRepairedView — 노드 집합 보존", () => {
  const flow = makeFlow()
  const { view } = toFlowSpecView(flow)
  const restored = applyRepairedView(flow, view)
  // 각 dialog의 노드 ID 집합이 동일
  for (let i = 0; i < flow.dialogs.length; i++) {
    const origIds = flow.dialogs[i].nodes.map(n => n.id).sort()
    const restoredIds = restored.dialogs[i].nodes.map(n => n.id).sort()
    assertEquals(restoredIds, origIds)
  }
})

Deno.test("AC1: 정상 머신트리 → toFlowSpecView → applyRepairedView — then 에지 보존", () => {
  const flow = makeFlow()
  const { view } = toFlowSpecView(flow)
  const restored = applyRepairedView(flow, view)
  for (let i = 0; i < flow.dialogs.length; i++) {
    assertEquals(restored.dialogs[i].then, flow.dialogs[i].then)
    for (const origNode of flow.dialogs[i].nodes) {
      const restoredNode = restored.dialogs[i].nodes.find(n => n.id === origNode.id)
      assertExists(restoredNode)
      assertEquals(restoredNode.then, origNode.then)
    }
  }
})

Deno.test("AC1: 왕복 불변 — validateFlow로 원본 view가 valid임을 확인", () => {
  const flow = makeFlow()
  const { view, catalog } = toFlowSpecView(flow)
  const result = validateFlow(view, catalog)
  assertEquals(result.valid, true)
  assertEquals(result.errors, [])
})

// ── AC2: 에러 표면화 ─────────────────────────────────────────────────────────

Deno.test("AC2a: dangling then → validateFlow valid:false + 끊긴 참조 에러 포함", () => {
  const flow = {
    dialogs: [{
      id: 'd1',
      then: ['n1'],
      nodes: [
        { id: 'n1', type: 'output', label: '출력', then: ['nonexistent'] },
      ],
    }],
  }
  const { view, catalog } = toFlowSpecView(flow)
  const result = validateFlow(view, catalog)
  assertEquals(result.valid, false)
  const hasDanglingError = result.errors.some(e => e.includes('nonexistent'))
  assertEquals(hasDanglingError, true)
})

Deno.test("AC2b: orphan 노드(도달 불가 순환) → validateFlow valid:false + 고아 에러 포함", () => {
  const flow = {
    dialogs: [{
      id: 'd1',
      then: ['n1'],
      nodes: [
        { id: 'n1', type: 'output', label: '출력', then: [] },
        { id: 'n2', type: 'output', label: '고아A', then: ['n3'] },
        { id: 'n3', type: 'output', label: '고아B', then: ['n2'] },
      ],
    }],
  }
  // n2·n3는 서로만 참조(순환), n1에서 도달 불가 → 고아
  const { view, catalog } = toFlowSpecView(flow)
  const result = validateFlow(view, catalog)
  assertEquals(result.valid, false)
  const hasOrphanError = result.errors.some(e => e.includes('고아'))
  assertEquals(hasOrphanError, true)
})

Deno.test("AC2c: 도달 가능한 종결 노드 없음 → validateFlow valid:false + 종결 에러 포함", () => {
  const flow = {
    dialogs: [{
      id: 'd1',
      then: ['n1'],
      nodes: [
        { id: 'n1', type: 'condition', label: '분기', then: ['n2'] },
        { id: 'n2', type: 'condition', label: '분기2', then: [] },
      ],
    }],
  }
  // 모든 노드가 condition 타입(isTerminal:false) → 종결 경로 없음
  const { view, catalog } = toFlowSpecView(flow)
  const result = validateFlow(view, catalog)
  assertEquals(result.valid, false)
  const hasTerminalError = result.errors.some(e => e.includes('종결'))
  assertEquals(hasTerminalError, true)
})

// ── AC3: prune 반영 ───────────────────────────────────────────────────────────

Deno.test("AC3a: dangling then → repairFlow 제거 → applyRepairedView가 then에서 제거", () => {
  const flow = {
    dialogs: [{
      id: 'd1',
      then: ['n1'],
      nodes: [
        { id: 'n1', type: 'output', label: '출력', then: ['n2', 'nonexistent'] },
        { id: 'n2', type: 'output', label: '결과', then: [] },
      ],
    }],
  }
  const { view, catalog } = toFlowSpecView(flow)
  const { flow: repairedView } = repairFlow(view, catalog)
  const pruned = applyRepairedView(flow, repairedView)
  // n1의 then에서 nonexistent 제거됨
  const n1 = pruned.dialogs[0].nodes.find(n => n.id === 'n1')
  assertEquals(n1.then, ['n2'])
  // n2 보존
  assertExists(pruned.dialogs[0].nodes.find(n => n.id === 'n2'))
})

Deno.test("AC3b: orphan 노드(순환) → repairFlow 제거 → applyRepairedView가 머신트리에서 삭제", () => {
  const flow = {
    dialogs: [{
      id: 'd1',
      then: ['n1'],
      nodes: [
        { id: 'n1', type: 'output', label: '출력', then: [] },
        { id: 'n2', type: 'output', label: '고아A', then: ['n3'] },
        { id: 'n3', type: 'output', label: '고아B', then: ['n2'] },
      ],
    }],
  }
  const { view, catalog } = toFlowSpecView(flow)
  const { flow: repairedView } = repairFlow(view, catalog)
  const pruned = applyRepairedView(flow, repairedView)
  const nodeIds = pruned.dialogs[0].nodes.map(n => n.id)
  // n2·n3 제거됨
  assertEquals(nodeIds.includes('n2'), false)
  assertEquals(nodeIds.includes('n3'), false)
  // n1 보존
  assertEquals(nodeIds.includes('n1'), true)
})

Deno.test("AC3c: dialog.then에서도 삭제된 노드 참조 제거", () => {
  const flow = {
    dialogs: [{
      id: 'd1',
      then: ['n1', 'n_gone'],
      nodes: [
        { id: 'n1', type: 'output', label: '출력', then: [] },
      ],
    }],
  }
  // n_gone은 dialog.then에만 있고 nodes에 없음 → dangling entry
  // toFlowSpecView: n_gone 미포함 → view에서 n_gone은 아무 노드도 아님
  // repairFlow는 노드 목록 기준이므로 n_gone은 view에 없어 직접 처리 안 됨
  // applyRepairedView: repairedNodeIds에 n_gone 없음 → dialog.then 필터로 제거
  const { view, catalog } = toFlowSpecView(flow)
  const { flow: repairedView } = repairFlow(view, catalog)
  const pruned = applyRepairedView(flow, repairedView)
  // dialog.then에서 n_gone 제거됨
  assertEquals(pruned.dialogs[0].then, ['n1'])
})

Deno.test("AC3d: 나머지 노드·필드는 prune 후에도 보존", () => {
  const flow = {
    id: 'flow1',
    name: '테스트',
    dialogs: [{
      id: 'd1',
      then: ['n1'],
      metadata: { version: 2 },
      nodes: [
        { id: 'n1', type: 'output', label: '출력', config: { key: 'val' }, then: ['nonexistent'] },
      ],
    }],
  }
  const { view, catalog } = toFlowSpecView(flow)
  const { flow: repairedView } = repairFlow(view, catalog)
  const pruned = applyRepairedView(flow, repairedView)
  // 지시 범위 밖 필드 보존
  assertEquals(pruned.id, 'flow1')
  assertEquals(pruned.name, '테스트')
  assertEquals(pruned.dialogs[0].metadata.version, 2)
  const n1 = pruned.dialogs[0].nodes.find(n => n.id === 'n1')
  assertEquals(n1.label, '출력')
  assertEquals(n1.config.key, 'val')
})

// ── AC4: 순수(입력 불변) ──────────────────────────────────────────────────────

Deno.test("AC4a: toFlowSpecView — 입력 flow 불변", () => {
  const flow = makeFlow()
  const snapshot = JSON.parse(JSON.stringify(flow))
  toFlowSpecView(flow)
  assertEquals(flow, snapshot)
})

Deno.test("AC4b: applyRepairedView — 입력 flow 불변", () => {
  const flow = makeFlow()
  const snapshot = JSON.parse(JSON.stringify(flow))
  const { view } = toFlowSpecView(flow)
  applyRepairedView(flow, view)
  assertEquals(flow, snapshot)
})

Deno.test("AC4c: applyRepairedView — 반환값은 원본과 다른 객체", () => {
  const flow = makeFlow()
  const { view } = toFlowSpecView(flow)
  const restored = applyRepairedView(flow, view)
  assertEquals(restored === flow, false)
})

Deno.test("AC4d: toFlowSpecView 반환 view — 원본 flow 노드의 then 공유 없음(독립 복사)", () => {
  const flow = makeFlow()
  const { view } = toFlowSpecView(flow)
  // view 노드의 next를 변경해도 원본 flow가 영향받지 않아야 함
  const viewNode = view.nodes.find(n => n.id === 'w1')
  assertExists(viewNode)
  const origLen = flow.dialogs[0].nodes[0].then.length
  viewNode.next.push('injected')
  assertEquals(flow.dialogs[0].nodes[0].then.length, origLen)
})

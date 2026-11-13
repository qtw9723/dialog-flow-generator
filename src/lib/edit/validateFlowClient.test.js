// validateFlowClient.js 테스트 — AC3(dangling/고립 노드)·기본 검증 케이스
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateFlow, repairFlow } from './validateFlowClient.js'

const catalog = [
  { type: 'output', label: 'output', description: '', promptInstruction: '', isTerminal: true },
  { type: 'input', label: 'input', description: '', promptInstruction: '', isTerminal: false },
  { type: 'condition', label: 'condition', description: '', promptInstruction: '', isTerminal: false },
]

// 정상 flow
const goodFlow = {
  version: '1',
  entry: 'n1',
  nodes: [
    { id: 'n1', type: 'input', intent: '', next: ['n2'] },
    { id: 'n2', type: 'output', intent: '', next: [] },
  ],
}

Deno.test('validateFlow: 정상 flow — valid:true', () => {
  const result = validateFlow(goodFlow, catalog)
  assertEquals(result.valid, true)
  assertEquals(result.errors.length, 0)
})

Deno.test('validateFlow: dangling next 참조 → valid:false', () => {
  const flow = {
    version: '1',
    entry: 'n1',
    nodes: [
      { id: 'n1', type: 'input', intent: '', next: ['ghost'] },
      { id: 'n2', type: 'output', intent: '', next: [] },
    ],
  }
  const result = validateFlow(flow, catalog)
  assertEquals(result.valid, false)
  assertEquals(result.errors.some(e => e.includes('ghost')), true)
})

Deno.test('validateFlow: 자기 참조 순환으로 소스에서 도달 불가한 노드 → valid:false', () => {
  // n4가 자기 자신만 참조(순환) → targeted에 포함되어 소스가 아님 → n1에서 도달 불가 → 고립
  const flow = {
    version: '1',
    entry: 'n1',
    nodes: [
      { id: 'n1', type: 'input', intent: '', next: ['n2'] },
      { id: 'n2', type: 'output', intent: '', next: [] },
      { id: 'n4', type: 'output', intent: '', next: ['n4'] },
    ],
  }
  const result = validateFlow(flow, catalog)
  assertEquals(result.valid, false)
  assertEquals(result.errors.some(e => e.includes('n4')), true)
})

Deno.test('validateFlow: entry 없음 → valid:false', () => {
  const flow = {
    version: '1',
    entry: 'missing',
    nodes: [
      { id: 'n1', type: 'input', intent: '', next: ['n2'] },
      { id: 'n2', type: 'output', intent: '', next: [] },
    ],
  }
  const result = validateFlow(flow, catalog)
  assertEquals(result.valid, false)
  assertEquals(result.errors.some(e => e.includes('missing')), true)
})

Deno.test('validateFlow: 종결 노드 없음 → valid:false', () => {
  const flow = {
    version: '1',
    entry: 'n1',
    nodes: [
      { id: 'n1', type: 'input', intent: '', next: [] },
    ],
  }
  const result = validateFlow(flow, catalog)
  assertEquals(result.valid, false)
  assertEquals(result.errors.some(e => e.includes('종결')), true)
})

Deno.test('repairFlow: dangling 참조 제거 후 validateFlow 통과 → AC3 확정 가능', () => {
  const flow = {
    version: '1',
    entry: 'n1',
    nodes: [
      { id: 'n1', type: 'input', intent: '', next: ['n2', 'ghost'] },
      { id: 'n2', type: 'output', intent: '', next: [] },
    ],
  }
  const beforeValidation = validateFlow(flow, catalog)
  assertEquals(beforeValidation.valid, false, 'repair 전엔 invalid')

  const { flow: repaired, repaired: didRepair } = repairFlow(flow, catalog)
  assertEquals(didRepair, true)
  const afterValidation = validateFlow(repaired, catalog)
  assertEquals(afterValidation.valid, true, 'repair 후엔 valid')
})

Deno.test('repairFlow: 소스에서 도달 불가한 순환 노드 제거 후 validateFlow 통과', () => {
  // n4(자기 참조 순환)는 n1에서 도달 불가 → repairFlow가 제거
  const flow = {
    version: '1',
    entry: 'n1',
    nodes: [
      { id: 'n1', type: 'input', intent: '', next: ['n2'] },
      { id: 'n2', type: 'output', intent: '', next: [] },
      { id: 'n4', type: 'output', intent: '', next: ['n4'] },
    ],
  }
  const { flow: repaired, repaired: didRepair } = repairFlow(flow, catalog)
  assertEquals(didRepair, true)
  const v = validateFlow(repaired, catalog)
  assertEquals(v.valid, true)
  assertEquals(repaired.nodes.some(n => n.id === 'n4'), false, '순환 고립 노드 제거됨')
})

Deno.test('repairFlow: 정상 flow는 무변경', () => {
  const { flow: repaired, repaired: didRepair } = repairFlow(goodFlow, catalog)
  assertEquals(didRepair, false)
  assertEquals(repaired, goodFlow)
})

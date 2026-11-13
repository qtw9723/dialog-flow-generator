import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { readLoopBody, materializeLoopBody } from "./loopBody.js"

function flowWithLoop() {
  return {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'root', type: 'output', label: '진입', then: ['vloop'] },
        { id: 'vloop', type: 'subflow', label: '검증 루프', config: { loop: { condition: 'context.ok', count: '3' } }, body: ['b_ask'], then: ['done'] },
        { id: 'b_ask', type: 'input', label: '송장 입력', then: ['b_chk'] },
        { id: 'b_chk', type: 'node', label: '형식 검증', then: [] },
        { id: 'done', type: 'output', label: '완료', then: [] },
      ],
      then: ['root'],
    }],
  }
}

Deno.test("readLoopBody: body then-체인을 순서대로 읽는다", () => {
  const steps = readLoopBody(flowWithLoop(), 'vloop')
  assertEquals(steps.map((s) => ({ id: s.id, type: s.type, label: s.label })), [
    { id: 'b_ask', type: 'input', label: '송장 입력' },
    { id: 'b_chk', type: 'node', label: '형식 검증' },
  ])
})

Deno.test("readLoopBody: subflow 아니면 빈 배열", () => {
  assertEquals(readLoopBody(flowWithLoop(), 'root'), [])
})

Deno.test("materializeLoopBody: 스텝 추가 → body·then 체인·노드 반영", () => {
  const flow = flowWithLoop()
  const main = flow.dialogs[0]
  const steps = [
    { id: 'b_ask', type: 'input', label: '송장 입력', config: {} },
    { id: 'b_chk', type: 'node', label: '형식 검증', config: {} },
    { id: 'vloop__b9', type: 'output', label: '다시 입력', config: { items: [{ type: 'text', text: [{ texts: ['다시'] }] }] } },
  ]
  materializeLoopBody(main, 'vloop', steps, new Set(['b_ask', 'b_chk']))
  const byId = new Map(main.nodes.map((n) => [n.id, n]))
  assertEquals(byId.get('vloop').body, ['b_ask'])
  assertEquals(byId.get('b_ask').then, ['b_chk'])
  assertEquals(byId.get('b_chk').then, ['vloop__b9'])
  assertEquals(byId.get('vloop__b9').then, [])
  assertEquals(byId.get('vloop__b9').label, '다시 입력')
})

Deno.test("materializeLoopBody: 스텝 제거 → 옛 본문 노드 삭제", () => {
  const flow = flowWithLoop()
  const main = flow.dialogs[0]
  // b_chk 제거, b_ask만 남김
  materializeLoopBody(main, 'vloop', [{ id: 'b_ask', type: 'input', label: '송장 입력', config: {} }], new Set(['b_ask', 'b_chk']))
  const ids = main.nodes.map((n) => n.id)
  assertEquals(ids.includes('b_chk'), false, 'b_chk 제거됨')
  assertEquals(ids.includes('b_ask'), true, 'b_ask 유지')
  assertEquals(new Map(main.nodes.map((n) => [n.id, n])).get('b_ask').then, [])
})

Deno.test("materializeLoopBody: 빈 본문 → subflow.body=[]", () => {
  const flow = flowWithLoop()
  const main = flow.dialogs[0]
  materializeLoopBody(main, 'vloop', [], new Set(['b_ask', 'b_chk']))
  const byId = new Map(main.nodes.map((n) => [n.id, n]))
  assertEquals(byId.get('vloop').body, [])
  assertEquals(main.nodes.some((n) => n.id === 'b_ask'), false)
})

Deno.test("materializeLoopBody: 새 루프(옛 본문 없음)에 스텝 추가", () => {
  const flow = {
    dialogs: [{ id: 'main', nodes: [{ id: 'nl', type: 'subflow', label: '새 반복', config: { loop: { condition: '', count: '' } }, body: [], then: [] }], then: ['nl'] }],
  }
  materializeLoopBody(flow.dialogs[0], 'nl', [{ id: 'nl__b1', type: 'output', label: '반복 멘트', config: {} }], new Set())
  const byId = new Map(flow.dialogs[0].nodes.map((n) => [n.id, n]))
  assertEquals(byId.get('nl').body, ['nl__b1'])
  assertEquals(byId.get('nl__b1').type, 'output')
})

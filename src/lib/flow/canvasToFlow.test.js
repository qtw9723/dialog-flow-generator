import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { canvasToFlow } from "./canvasToFlow.js"
import { deriveStructure } from "../refDiagram.js"

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────
// refDiagram.test.js 의 exampleFlow와 동일 (독립 복사본)
function makeExampleFlow() {
  return {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['greet'] },
        {
          id: 'greet', type: 'output', label: '환영 인사',
          config: { items: [{ type: 'text', text: [{ texts: ['안녕하세요!'] }] }] },
          then: [],
        },
        {
          id: 'n1', type: 'output', label: '배송 안내',
          condition: '배송 어디쯤이야',
          config: { items: [{ type: 'text', text: [{ texts: ['배송 안내입니다.'] }] }] },
          then: ['ask'],
        },
        { id: 'ask', type: 'input', label: '송장번호 입력', then: ['vloop'] },
        {
          id: 'vloop', type: 'subflow', label: '형식 검증',
          config: { loop: { condition: 'context.ok', count: '3' } },
          body: ['retry'],
          then: ['done'],
        },
        {
          id: 'retry', type: 'output', label: '다시 입력 안내',
          config: { items: [{ type: 'text', text: [{ texts: ['다시 입력해 주세요.'] }] }] },
          then: [],
        },
        {
          id: 'done', type: 'output', label: '조회 결과 안내',
          config: { items: [{ type: 'text', text: [{ texts: ['조회 결과입니다.'] }] }] },
          then: [],
        },
        { id: 'fallback', type: 'fallback', then: [] },
      ],
      then: ['w', 'n1', 'fallback'],
    }],
  }
}

// branchFlow: 분기(then 2개) 픽스처
function makeBranchFlow() {
  return {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: [] },
        {
          id: 'root', type: 'output', label: '어떤 도움이 필요하세요?',
          condition: '도움 요청',
          config: { items: [{ type: 'text', text: [{ texts: ['어떤 도움이 필요하세요?'] }] }] },
          then: ['branch1', 'branch2'],
        },
        {
          id: 'branch1', type: 'output', label: '배송 조회',
          config: { items: [{ type: 'text', text: [{ texts: ['배송 조회 안내입니다.'] }] }] },
          then: [],
        },
        {
          id: 'branch2', type: 'output', label: '반품 안내',
          config: { items: [{ type: 'text', text: [{ texts: ['반품 안내입니다.'] }] }] },
          then: [],
        },
        { id: 'fallback', type: 'fallback', then: [] },
      ],
      then: ['w', 'root', 'fallback'],
    }],
  }
}

// __init 브리지 픽스처
function makeInitBridgeFlow() {
  return {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: [] },
        { id: 'r', type: 'node', label: '진입', condition: '조회', then: ['r_setinit'] },
        { id: 'r_setinit', type: 'set', label: '수집 초기화', then: ['r_col__init'] },
        { id: 'r_col__init', type: 'set', label: '(init)', then: ['r_col'] },
        {
          id: 'r_col', type: 'subflow', label: '반복 수집',
          config: { loop: { count: '10' } }, body: ['r_o1'], then: ['r_o2'],
        },
        { id: 'r_o1', type: 'output', label: '입력받기', then: [] },
        { id: 'r_o2', type: 'output', label: '확인 안내', then: [] },
        { id: 'fallback', type: 'fallback', then: [] },
      ],
      then: ['w', 'r', 'fallback'],
    }],
  }
}

// derived 노드·엣지를 canvas 포맷으로 변환하는 헬퍼
function toCanvas(flow) {
  const { nodes, edges } = deriveStructure(flow)
  return {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type, label: n.label } })),
    edges: edges.map(e => ({ source: e.from, target: e.to })),
  }
}

function mainOf(flow) {
  return flow.dialogs.find(d => d.id === 'main')
}

// ── AC1: 왕복 불변 ────────────────────────────────────────────────────────────

Deno.test('AC1 왕복 불변: exampleFlow — 무변경 저장이 flow를 흔들지 않는다', () => {
  const flow = makeExampleFlow()
  const canvas = toCanvas(flow)
  const result = canvasToFlow(flow, canvas)
  assertEquals(result, flow)
})

Deno.test('AC1 왕복 불변: branchFlow — 분기 구조도 동일 보존', () => {
  const flow = makeBranchFlow()
  const canvas = toCanvas(flow)
  const result = canvasToFlow(flow, canvas)
  assertEquals(result, flow)
})

Deno.test('AC1 왕복 불변: __init 브리지 flow — r_setinit.then=[r_col__init] 보존', () => {
  const flow = makeInitBridgeFlow()
  const canvas = toCanvas(flow)
  const result = canvasToFlow(flow, canvas)
  // r_setinit.then 은 ['r_col__init'] 로 그대로여야 함
  const main = mainOf(result)
  const rSetinit = main.nodes.find(n => n.id === 'r_setinit')
  assertEquals(rSetinit.then, ['r_col__init'])
  // 전체도 deep-equal
  assertEquals(result, flow)
})

// ── AC2: 노드 삭제 ────────────────────────────────────────────────────────────

Deno.test('AC2 노드 삭제: done 제거 → dialog.nodes에서 삭제', () => {
  const flow = makeExampleFlow()
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.filter(n => n.id !== 'done').map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.filter(e => e.from !== 'done' && e.to !== 'done')
      .map(e => ({ source: e.from, target: e.to })),
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  assertEquals(main.nodes.some(n => n.id === 'done'), false, 'done 노드 삭제됨')
})

Deno.test('AC2 노드 삭제: done 제거 → vloop.then에서 참조 제거(dangling 없음)', () => {
  const flow = makeExampleFlow()
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.filter(n => n.id !== 'done').map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.filter(e => e.from !== 'done' && e.to !== 'done')
      .map(e => ({ source: e.from, target: e.to })),
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  const vloop = main.nodes.find(n => n.id === 'vloop')
  assertEquals(vloop.then.includes('done'), false, 'vloop.then에 done 없음')
  // 모든 then·dialog.then에 done 없음
  for (const n of main.nodes) {
    assertEquals(n.then?.includes('done'), false, `${n.id}.then에 done 없음`)
  }
  assertEquals(main.then.includes('done'), false, 'dialog.then에 done 없음')
})

Deno.test('AC2 노드 삭제: 중간 노드 ask 제거 → 자식 vloop가 n1.then으로 재연결', () => {
  const flow = makeExampleFlow()
  const { nodes, edges } = deriveStructure(flow)
  // ask 삭제. n1→ask→vloop 이므로 ask 제거 시 n1→vloop 재연결 기대
  const canvas = {
    nodes: nodes.filter(n => n.id !== 'ask').map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.filter(e => e.from !== 'ask' && e.to !== 'ask')
      .map(e => ({ source: e.from, target: e.to })),
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  assertEquals(main.nodes.some(n => n.id === 'ask'), false, 'ask 삭제됨')
  const n1 = main.nodes.find(n => n.id === 'n1')
  assertEquals(n1.then.includes('vloop'), true, 'n1.then에 vloop 재연결')
})

// ── AC3: 노드 추가 ────────────────────────────────────────────────────────────

Deno.test('AC3 노드 추가: ask→newNode→vloop 삽입 → dialog.nodes에 newNode 추가', () => {
  const flow = makeExampleFlow()
  const { nodes, edges } = deriveStructure(flow)
  const newNode = { id: 'newNode', data: { type: 'set', label: '새 처리' } }
  const canvas = {
    nodes: [...nodes.map(n => ({ id: n.id, data: { type: n.type } })), newNode],
    edges: [
      ...edges.filter(e => !(e.from === 'ask' && e.to === 'vloop'))
        .map(e => ({ source: e.from, target: e.to })),
      { source: 'ask', target: 'newNode' },
      { source: 'newNode', target: 'vloop' },
    ],
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  assertEquals(main.nodes.some(n => n.id === 'newNode'), true, 'newNode 추가됨')
})

Deno.test('AC3 노드 추가: ask.then=[newNode], newNode.then=[vloop] 연결', () => {
  const flow = makeExampleFlow()
  const { nodes, edges } = deriveStructure(flow)
  const newNode = { id: 'newNode', data: { type: 'set', label: '새 처리' } }
  const canvas = {
    nodes: [...nodes.map(n => ({ id: n.id, data: { type: n.type } })), newNode],
    edges: [
      ...edges.filter(e => !(e.from === 'ask' && e.to === 'vloop'))
        .map(e => ({ source: e.from, target: e.to })),
      { source: 'ask', target: 'newNode' },
      { source: 'newNode', target: 'vloop' },
    ],
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  const ask = main.nodes.find(n => n.id === 'ask')
  const newNodeInFlow = main.nodes.find(n => n.id === 'newNode')
  assertEquals(ask.then.includes('newNode'), true, 'ask.then에 newNode')
  assertEquals(newNodeInFlow.then.includes('vloop'), true, 'newNode.then에 vloop')
  // ask.then에 vloop 직접 참조 없어야 함 (newNode로 대체)
  assertEquals(ask.then.includes('vloop'), false, 'ask.then에 vloop 직접 없음')
})

Deno.test('AC3 노드 추가: 중간 노드는 dialog.then에 포함되지 않는다', () => {
  const flow = makeExampleFlow()
  const { nodes, edges } = deriveStructure(flow)
  const newNode = { id: 'newNode', data: { type: 'set', label: '새 처리' } }
  const canvas = {
    nodes: [...nodes.map(n => ({ id: n.id, data: { type: n.type } })), newNode],
    edges: [
      ...edges.filter(e => !(e.from === 'ask' && e.to === 'vloop'))
        .map(e => ({ source: e.from, target: e.to })),
      { source: 'ask', target: 'newNode' },
      { source: 'newNode', target: 'vloop' },
    ],
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  assertEquals(main.then.includes('newNode'), false, '중간 노드는 dialog.then 비포함')
})

// ── AC4: 엣지 추가/삭제 ──────────────────────────────────────────────────────

Deno.test('AC4 엣지 삭제: root→branch1 제거 → root.then=[branch2]', () => {
  const flow = makeBranchFlow()
  const { nodes, edges } = deriveStructure(flow)
  // branch1 은 canvas에 존재, 엣지만 삭제
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.filter(e => !(e.from === 'root' && e.to === 'branch1'))
      .map(e => ({ source: e.from, target: e.to })),
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  const root = main.nodes.find(n => n.id === 'root')
  assertEquals(root.then.includes('branch1'), false, 'branch1 엣지 삭제됨')
  assertEquals(root.then.includes('branch2'), true, 'branch2 엣지 유지')
})

Deno.test('AC4 엣지 추가: root 에 branch3 추가 → root.then=[branch1, branch2, branch3]', () => {
  const flow = makeBranchFlow()
  // branch3 추가
  const flowWithBranch3 = JSON.parse(JSON.stringify(flow))
  const mainD = flowWithBranch3.dialogs.find(d => d.id === 'main')
  mainD.nodes.push({ id: 'branch3', type: 'output', label: '교환 안내', then: [] })
  // branch3는 flow에는 있지만 derived에는 없음(root.then에 연결 안 됨)
  // 따라서 canvas 관점에서는 "기존 derived 노드" + branch3 추가
  const { nodes, edges } = deriveStructure(flowWithBranch3)
  // canvas: branch3도 포함하고, root→branch3 엣지 추가
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: [
      ...edges.map(e => ({ source: e.from, target: e.to })),
      { source: 'root', target: 'branch3' },
    ],
  }
  const result = canvasToFlow(flowWithBranch3, canvas)
  const main = mainOf(result)
  const root = main.nodes.find(n => n.id === 'root')
  assertEquals(root.then.includes('branch1'), true)
  assertEquals(root.then.includes('branch2'), true)
  assertEquals(root.then.includes('branch3'), true)
})

Deno.test('AC4 엣지 변경: __init 브리지 노드 — 직접 엣지 교체', () => {
  const flow = makeInitBridgeFlow()
  const { nodes, edges } = deriveStructure(flow)
  // r_setinit → r_col 엣지를 r_setinit → r_o2 로 변경
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: [
      ...edges.filter(e => !(e.from === 'r_setinit' && e.to === 'r_col'))
        .map(e => ({ source: e.from, target: e.to })),
      { source: 'r_setinit', target: 'r_o2' },
    ],
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  const rSetinit = main.nodes.find(n => n.id === 'r_setinit')
  // __init 브리지 대체: r_col__init 제거, r_o2 직접 연결
  assertEquals(rSetinit.then.includes('r_o2'), true, 'r_o2로 변경됨')
  assertEquals(rSetinit.then.includes('r_col__init'), false, '__init 브리지 제거됨')
})

// ── AC5: 순수성·불변 ──────────────────────────────────────────────────────────

Deno.test('AC5 순수성: 입력 flow 객체 변형 없음 (노드 변경)', () => {
  const flow = makeExampleFlow()
  const orig = JSON.stringify(flow)
  const { nodes, edges } = deriveStructure(flow)
  // done 삭제
  const canvas = {
    nodes: nodes.filter(n => n.id !== 'done').map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.filter(e => e.from !== 'done' && e.to !== 'done')
      .map(e => ({ source: e.from, target: e.to })),
  }
  canvasToFlow(flow, canvas)
  assertEquals(JSON.stringify(flow), orig, '입력 flow 불변')
})

Deno.test('AC5 순수성: 입력 flow 객체 변형 없음 (엣지 변경)', () => {
  const flow = makeBranchFlow()
  const orig = JSON.stringify(flow)
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.filter(e => !(e.from === 'root' && e.to === 'branch1'))
      .map(e => ({ source: e.from, target: e.to })),
  }
  canvasToFlow(flow, canvas)
  assertEquals(JSON.stringify(flow), orig, '입력 flow 불변')
})

Deno.test('AC5 순수성: null 입력 → null 그대로 반환', () => {
  const result = canvasToFlow(null, { nodes: [], edges: [] })
  assertEquals(result, null)
})

// ── AC7: 시각 전용 그룹 래퍼(scenarioGroup, _g_*)는 flow에 주입되지 않음 ──────────

Deno.test('AC7 그룹 래퍼 무시: 캔버스의 _g_ scenarioGroup 노드는 dialog.then·nodes에 추가 안 됨', () => {
  const flow = makeBranchFlow()
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: [
      ...nodes.map(n => ({ id: n.id, type: 'structureNode', data: { type: n.type } })),
      // 다이어그램이 그리는 시나리오 그룹 박스(시각 전용) — 실제 노드 아님
      { id: '_g_root', type: 'scenarioGroup', data: { label: '시나리오' } },
    ],
    edges: edges.map(e => ({ source: e.from, target: e.to })),
  }
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  const ids = main.nodes.map(n => n.id)
  assertEquals(ids.includes('_g_root'), false, '_g_ 그룹 노드가 nodes에 없어야 함')
  assertEquals((main.then || []).includes('_g_root'), false, '_g_ 그룹 노드가 dialog.then에 없어야 함')
  // 실제 노드는 그대로 보존
  assertEquals(ids.includes('root'), true)
  assertEquals(ids.includes('branch1'), true)
})

// ── AC6: 엣지 조건 편집 → 타겟 노드 condition 반영 ──────────────────────────────

Deno.test('AC6 엣지 조건: root→branch2 에 조건 설정 → branch2.condition 기록', () => {
  const flow = makeBranchFlow()
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.map(e => e.from === 'root' && e.to === 'branch2'
      ? { source: e.from, target: e.to, data: { condition: "includes('반품')" } }
      : { source: e.from, target: e.to }),
  }
  const result = canvasToFlow(flow, canvas)
  const branch2 = mainOf(result).nodes.find(n => n.id === 'branch2')
  assertEquals(branch2.condition, "includes('반품')")
  // 조건 안 준 branch1은 원본대로(조건 없음) 유지
  const branch1 = mainOf(result).nodes.find(n => n.id === 'branch1')
  assertEquals(branch1.condition, undefined)
})

Deno.test('AC6 엣지 조건: 빈 조건 적용 → 타겟 condition 삭제', () => {
  const flow = makeBranchFlow()
  // root.condition '도움 요청'을 root 진입선으로 비우는 대신, branch1에 조건 후 제거 검증
  const withCond = JSON.parse(JSON.stringify(flow))
  withCond.dialogs[0].nodes.find(n => n.id === 'branch1').condition = "includes('배송')"
  const { nodes, edges } = deriveStructure(withCond)
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.map(e => e.from === 'root' && e.to === 'branch1'
      ? { source: e.from, target: e.to, data: { condition: '' } }
      : { source: e.from, target: e.to }),
  }
  const result = canvasToFlow(withCond, canvas)
  const branch1 = mainOf(result).nodes.find(n => n.id === 'branch1')
  assertEquals(branch1.condition, undefined, '빈 조건 → condition 삭제')
})

Deno.test('AC6 엣지 조건: data.condition 없는 엣지는 원본 condition 보존', () => {
  const flow = makeBranchFlow()
  // root에 원래 condition '도움 요청'이 있음 — 조건 미편집 시 보존돼야 함
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.map(e => ({ source: e.from, target: e.to })),  // data.condition 없음
  }
  const result = canvasToFlow(flow, canvas)
  const root = mainOf(result).nodes.find(n => n.id === 'root')
  assertEquals(root.condition, '도움 요청', '미편집 엣지는 원본 condition 보존')
})

Deno.test('AC6 순수성: 조건 편집 시 입력 flow 불변', () => {
  const flow = makeBranchFlow()
  const orig = JSON.stringify(flow)
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.map(n => ({ id: n.id, data: { type: n.type } })),
    edges: edges.map(e => e.to === 'branch2'
      ? { source: e.from, target: e.to, data: { condition: 'x' } }
      : { source: e.from, target: e.to }),
  }
  canvasToFlow(flow, canvas)
  assertEquals(JSON.stringify(flow), orig, '입력 flow 불변')
})

// ── AC8: 노드 내용(label/config) 실어나르기 ─────────────────────────────────
Deno.test('AC8 내용 반영: 새 노드 data.config → flow 노드 config로 주입', () => {
  const flow = makeExampleFlow()
  const canvas = toCanvas(flow)
  // 새 output 노드 추가 + 멘트 config를 data에 실음(=편집기가 하는 일)
  canvas.nodes.push({
    id: 'n_new', type: 'structureNode',
    data: { type: 'output', label: '새 안내', config: { items: [{ type: 'text', text: [{ texts: ['새 멘트'] }] }] } },
  })
  canvas.edges.push({ source: 'done', target: 'n_new' })
  const result = canvasToFlow(flow, canvas)
  const nn = mainOf(result).nodes.find(n => n.id === 'n_new')
  assertEquals(nn.label, '새 안내')
  assertEquals(nn.config.items[0].text[0].texts, ['새 멘트'])
})

Deno.test('AC8 내용 반영: 기존 노드 편집(data.config 주입) → config 교체', () => {
  const flow = makeExampleFlow()
  const canvas = toCanvas(flow)
  // done 노드의 멘트를 편집기가 바꾼 상황
  canvas.nodes.find(n => n.id === 'done').data.config = { items: [{ type: 'text', text: [{ texts: ['바뀐 결과'] }] }] }
  const result = canvasToFlow(flow, canvas)
  const done = mainOf(result).nodes.find(n => n.id === 'done')
  assertEquals(done.config.items[0].text[0].texts, ['바뀐 결과'])
})

Deno.test('AC8 멱등: data.config 없는(미편집) 노드는 원본 config 보존', () => {
  const flow = makeExampleFlow()
  const canvas = toCanvas(flow) // data에 config 없음
  const result = canvasToFlow(flow, canvas)
  const done = mainOf(result).nodes.find(n => n.id === 'done')
  assertEquals(done.config.items[0].text[0].texts, ['조회 결과입니다.'], '미편집 노드 config 원본 보존')
})

Deno.test('AC8 반복 config: loopGroup data.config → subflow config.loop 반영', () => {
  const flow = makeExampleFlow()
  const canvas = toCanvas(flow)
  // 반복(vloop) 편집 — 편집기가 전체 config(loop 포함)를 data.config에 실음
  canvas.nodes.find(n => n.id === 'vloop').data.config = { loop: { condition: 'context.done', count: '5' }, body: ['retry'] }
  const result = canvasToFlow(flow, canvas)
  const vloop = mainOf(result).nodes.find(n => n.id === 'vloop')
  assertEquals(vloop.config.loop, { condition: 'context.done', count: '5' })
})

// ── AC9: 반복 본문 materialize (data.body) ─────────────────────────────────
Deno.test('AC9 반복 본문: 캔버스 loopGroup data.body → subflow.body·본문 노드·then 체인', () => {
  const flow = makeExampleFlow() // vloop(subflow, body:['retry'])
  const canvas = toCanvas(flow)
  // 반복 편집기가 본문을 2스텝으로 바꾼 상황(retry 유지 + 새 스텝 추가)
  const vloopCanvas = canvas.nodes.find(n => n.id === 'vloop')
  vloopCanvas.data.config = { loop: { condition: 'context.ok', count: '3' }, body: ['retry'] }
  vloopCanvas.data.body = [
    { id: 'retry', type: 'output', label: '다시 입력 안내', config: { items: [{ type: 'text', text: [{ texts: ['다시'] }] }] } },
    { id: 'vloop__b7', type: 'input', label: '재입력', config: { items: [{ key: 'local.no', value: 'input.text' }] } },
  ]
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  const vloop = main.nodes.find(n => n.id === 'vloop')
  assertEquals(vloop.body, ['retry'], 'subflow.body 첫 스텝')
  assertEquals(main.nodes.find(n => n.id === 'retry').then, ['vloop__b7'], '체인 연결')
  assertEquals(main.nodes.find(n => n.id === 'vloop__b7').type, 'input', '새 본문 노드 반영')
})

Deno.test('AC9 반복 본문: data.body 미지정(미편집) → 원본 본문 보존', () => {
  const flow = makeExampleFlow()
  const canvas = toCanvas(flow) // data.body 없음
  const result = canvasToFlow(flow, canvas)
  const main = mainOf(result)
  assertEquals(main.nodes.find(n => n.id === 'vloop').body, ['retry'], '원본 body 보존')
  assertEquals(main.nodes.some(n => n.id === 'retry'), true, '본문 노드 유실 없음')
})

// ── 라벨 오염 회귀 (v0.9.0, 실제 솔루션 봇에서 발견) ──────────────────────────

Deno.test('빈 label 노드는 왕복 후에도 빈 label로 남는다', () => {
  // deriveStructure는 표시용으로 set→"저장", output→"안내" 같은 기본 라벨을 채워 보낸다.
  // 그걸 되쓰면 원본의 빈 label이 오염된다. 업로드한 실제 봇에 흔한 상황.
  const flow = {
    id: 'b', name: 'b',
    dialogs: [{ id: 'main', then: ['s1'], nodes: [
      { id: 's1', type: 'set', label: '', then: ['o1'], config: { items: [] } },
      { id: 'o1', type: 'output', label: '', then: [], config: { items: [] } },
    ] }],
  }
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.map((n) => ({ id: n.id, data: { type: n.type, label: n.label } })),
    edges: edges.map((e) => ({ source: e.from, target: e.to })),
  }
  // 파생 라벨은 비어 있지 않다(표시용 기본값이 들어간다)
  assertEquals(canvas.nodes.find((n) => n.id === 's1').data.label.length > 0, true)

  const out = canvasToFlow(flow, canvas)
  const byId = new Map(out.dialogs[0].nodes.map((n) => [n.id, n]))
  assertEquals(byId.get('s1').label, '')
  assertEquals(byId.get('o1').label, '')
})

Deno.test('라벨을 실제로 바꾸면 저장된다(빈 라벨 노드도)', () => {
  const flow = {
    id: 'b', name: 'b',
    dialogs: [{ id: 'main', then: ['s1'], nodes: [{ id: 's1', type: 'set', label: '', then: [], config: { items: [] } }] }],
  }
  const { nodes, edges } = deriveStructure(flow)
  const canvas = {
    nodes: nodes.map((n) => ({ id: n.id, data: { type: n.type, label: '주문번호 저장' } })),
    edges: edges.map((e) => ({ source: e.from, target: e.to })),
  }
  const out = canvasToFlow(flow, canvas)
  assertEquals(out.dialogs[0].nodes[0].label, '주문번호 저장')
})

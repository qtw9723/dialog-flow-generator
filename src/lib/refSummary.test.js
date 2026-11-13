import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { summarizeReference } from './refSummary.js'

// 특성화 테스트 — refShared.js 추출 전 현재 동작을 고정한다(안전망).
// 픽스처 스타일은 refDiagram.test.js를 따른다.

// ── null 방어 ────────────────────────────────────────────────────

Deno.test('summarizeReference: dialogs에 main이 없으면 null', () => {
  const flow = { dialogs: [{ id: 'other', nodes: [], then: [] }] }
  assertEquals(summarizeReference(flow), null)
})

Deno.test('summarizeReference: dialogs 자체가 없으면 null', () => {
  assertEquals(summarizeReference({}), null)
  assertEquals(summarizeReference(null), null)
})

Deno.test('summarizeReference: 시나리오 노드가 0개면 null(보일러플레이트만 있는 경우)', () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['greet'] },
        { id: 'greet', type: 'output', label: '환영', then: [] },
        { id: 'fallback', type: 'fallback', then: [] },
      ],
      then: ['w', 'fallback'],
    }],
  }
  assertEquals(summarizeReference(flow), null)
})

// ── 종합 픽스처: 보일러플레이트 제외·__init 스킵·라벨 폴백·collects·firstMent·branchCount ──

const mainFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: ['greet'] },
      {
        id: 'greet', type: 'output', label: '환영 인사',
        config: { items: [{ type: 'text', text: [{ texts: ['안녕하세요!'] }] }] },
        then: ['greet_child'],
      },
      {
        // greeting 서브트리 아래 then으로 매달린 자식 — 이것도 제외돼야 함
        id: 'greet_child', type: 'output', label: '환영 서브',
        config: { items: [{ type: 'text', text: [{ texts: ['환영 서브 메시지'] }] }] },
        then: [],
      },
      {
        id: 'root', type: 'output', label: '루트 안내', condition: '조회',
        config: { items: [{ type: 'text', text: [{ texts: ['조회를 시작합니다.'] }] }] },
        then: ['ask', 'unknownNode'],
      },
      { id: 'ask', type: 'input', label: '송장번호 입력', then: ['saveinit'] },
      { id: 'saveinit', type: 'set', label: '값 저장 초기화 아님', then: ['save'] },
      {
        id: 'save', type: 'set', label: '송장번호를 저장',
        config: { items: [{ value: 'input.text' }] },
        then: ['save__init'],
      },
      { id: 'save__init', type: 'set', label: '(내부)', then: ['done'] },
      {
        id: 'done', type: 'output', label: '완료 안내',
        config: { items: [{ type: 'text', text: [{ texts: ['완료되었습니다.'] }] }] },
        then: [],
      },
      { id: 'unknownNode', type: 'foobar', then: [] },
      { id: 'fallback', type: 'fallback', then: ['bye'] },
      {
        id: 'bye', type: 'output', label: '작별 인사',
        config: { items: [{ type: 'text', text: [{ texts: ['안녕히 가세요.'] }] }] },
        then: [],
      },
    ],
    then: ['w', 'root', 'fallback'],
  }],
}

Deno.test('summarizeReference: greeting·fallback 서브트리(자식 포함)는 steps·nodeCount에서 제외', () => {
  const r = summarizeReference(mainFlow)
  assertEquals(r !== null, true)
  assertEquals(r.steps.includes('환영 인사'), false)
  assertEquals(r.steps.includes('환영 서브'), false, 'greeting 아래 then 자식도 제외')
  assertEquals(r.steps.includes('작별 인사'), false)
  assertEquals(r.nodeCount, 7, 'root·ask·saveinit·save·save__init·done·unknownNode = 7 (greeting·fallback 제외)')
})

Deno.test('summarizeReference: __init 노드는 steps에서 빠지지만 then은 계속 따라간다', () => {
  const { steps } = summarizeReference(mainFlow)
  assertEquals(steps.includes('(내부)'), false, 'save__init 자체는 숨김')
  assertEquals(steps.includes('완료 안내'), true, 'save__init 너머 done은 이어짐')
})

Deno.test('summarizeReference: steps 순서 = then 우선 DFS, 형제 순서 보존', () => {
  const { steps } = summarizeReference(mainFlow)
  assertEquals(steps, [
    '루트 안내',
    '송장번호 입력',
    '값 저장 초기화 아님',
    '송장번호를 저장',
    '완료 안내',
    'foobar',
  ])
})

Deno.test('summarizeReference: label 없으면 TYPE_KO[type] 폴백, 없으면 type 원문', () => {
  const { steps } = summarizeReference(mainFlow)
  // unknownNode: label 없음, TYPE_KO에 없는 type('foobar') → type 원문
  assertEquals(steps.includes('foobar'), true)
})

Deno.test('summarizeReference: label 없고 TYPE_KO에 있는 type이면 한글 폴백', () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'root', type: 'condition', condition: '분기 진입', then: [] },
      ],
      then: ['root'],
    }],
  }
  const { steps } = summarizeReference(flow)
  assertEquals(steps, ['분기'])
})

Deno.test('summarizeReference: collects — input 노드 + input 참조 set 노드, 저장 접미사 제거', () => {
  const { collects } = summarizeReference(mainFlow)
  assertEquals(collects, ['송장번호 입력', '송장번호'])
})

Deno.test('summarizeReference: firstMent — 첫 output 노드의 첫 텍스트', () => {
  const { firstMent } = summarizeReference(mainFlow)
  assertEquals(firstMent, '조회를 시작합니다.')
})

Deno.test('summarizeReference: branchCount — then이 2개 이상인 노드 수', () => {
  const { branchCount } = summarizeReference(mainFlow)
  assertEquals(branchCount, 1, 'root만 then 2개(ask, unknownNode)')
})

// ── DFS 순서 전용 픽스처: 분기 하위에 또 분기(깊이 우선 확인) ─────────────

const dfsFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'root', type: 'output', label: '루트', then: ['b1', 'b2'] },
      { id: 'b1', type: 'output', label: '가지1', then: ['c1'] },
      { id: 'c1', type: 'output', label: '가지1-자식', then: [] },
      { id: 'b2', type: 'output', label: '가지2', then: [] },
    ],
    then: ['root'],
  }],
}

Deno.test('summarizeReference: then-우선 DFS — b1 서브트리를 b2보다 먼저 완주', () => {
  const { steps } = summarizeReference(dfsFlow)
  assertEquals(steps, ['루트', '가지1', '가지1-자식', '가지2'])
})

Deno.test('summarizeReference: branchCount — 다단 분기에서도 then>=2인 노드만 센다', () => {
  const { branchCount } = summarizeReference(dfsFlow)
  assertEquals(branchCount, 1, 'root만 then 2개, b1/c1/b2는 각각 1개 이하')
})

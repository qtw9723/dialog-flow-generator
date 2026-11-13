import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { applyEditPatch } from "./applyEditPatch.js"

/** 각 테스트가 독립된 deep copy를 쓰도록 매번 생성한다. */
function makeFlow() {
  return {
    id: 'flow1',
    name: '테스트 플로우',
    dialogs: [
      {
        id: 'pre',
        then: ['pre1'],
        nodes: [
          {
            id: 'pre1', type: 'output', label: 'pre 출력',
            config: { items: [{ type: 'text', text: [{ texts: ['사전 멘트'] }] }] },
            then: [],
          },
        ],
      },
      {
        id: 'main',
        then: ['n1'],
        nodes: [
          {
            id: 'n1', type: 'output', label: '출력1',
            config: { items: [{ type: 'text', text: [{ texts: ['안녕하세요'] }] }] },
            then: ['n2'],
          },
          {
            id: 'n2', type: 'input', label: '입력1',
            config: {},
            then: ['n3'],
          },
          {
            id: 'n3', type: 'set', label: '저장1',
            config: {},
            condition: 'var == 1',
            then: ['n4'],
          },
          {
            id: 'n4', type: 'output', label: '출력2',
            config: { items: [{ type: 'text', text: [{ texts: ['결과'] }] }] },
            then: [],
          },
        ],
      },
      {
        id: 'post',
        then: [],
        nodes: [],
      },
    ],
  }
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function mainNodes(flow) {
  return flow.dialogs.find(d => d.id === 'main').nodes
}
function mainDialog(flow) {
  return flow.dialogs.find(d => d.id === 'main')
}
function preNodes(flow) {
  return flow.dialogs.find(d => d.id === 'pre').nodes
}

// ── set_ment ──────────────────────────────────────────────────────────────────

Deno.test('set_ment: 대상 노드의 texts 교체', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'set_ment', nodeId: 'n1', texts: ['수정된 멘트'],
  })
  const n1 = mainNodes(result).find(n => n.id === 'n1')
  assertEquals(n1.config.items[0].text[0].texts, ['수정된 멘트'])
})

Deno.test('set_ment: 비대상 노드 보존 (label·then·config)', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'set_ment', nodeId: 'n1', texts: ['변경'],
  })
  const n1 = mainNodes(result).find(n => n.id === 'n1')
  assertEquals(n1.label, '출력1')
  assertEquals(n1.then, ['n2'])
  assertEquals(n1.type, 'output')
  // n4 보존
  const n4 = mainNodes(result).find(n => n.id === 'n4')
  assertEquals(n4.config.items[0].text[0].texts, ['결과'])
})

Deno.test('set_ment: 비대상 dialog(pre) 보존', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'set_ment', nodeId: 'n1', texts: ['변경'],
  })
  assertEquals(preNodes(result)[0].config.items[0].text[0].texts, ['사전 멘트'])
})

Deno.test('set_ment: changedNodeIds = [nodeId]', () => {
  const { changedNodeIds } = applyEditPatch(makeFlow(), {
    op: 'set_ment', nodeId: 'n1', texts: ['변경'],
  })
  assertEquals(changedNodeIds, ['n1'])
})

// ── update_node ───────────────────────────────────────────────────────────────

Deno.test('update_node: 지정 필드만 변경', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'update_node', nodeId: 'n2', changes: { label: '새 입력 라벨' },
  })
  const n2 = mainNodes(result).find(n => n.id === 'n2')
  assertEquals(n2.label, '새 입력 라벨')
  assertEquals(n2.then, ['n3'])   // then 보존
  assertEquals(n2.type, 'input') // type 보존
})

Deno.test('update_node: 비대상 노드 보존', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'update_node', nodeId: 'n2', changes: { label: '변경' },
  })
  const n1 = mainNodes(result).find(n => n.id === 'n1')
  assertEquals(n1.label, '출력1')
  assertEquals(n1.config.items[0].text[0].texts, ['안녕하세요'])
})

Deno.test('update_node: changedNodeIds = [nodeId]', () => {
  const { changedNodeIds } = applyEditPatch(makeFlow(), {
    op: 'update_node', nodeId: 'n2', changes: { label: '변경' },
  })
  assertEquals(changedNodeIds, ['n2'])
})

// ── remove_node ───────────────────────────────────────────────────────────────

Deno.test('remove_node: 노드 삭제 후 nodes에 없음', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'remove_node', nodeId: 'n2',
  })
  assertEquals(mainNodes(result).find(n => n.id === 'n2'), undefined)
})

Deno.test('remove_node: 삭제 노드를 가리키던 node.then → 자식으로 재배선', () => {
  // n1.then=[n2], n2.then=[n3] → remove n2 → n1.then=[n3]
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'remove_node', nodeId: 'n2',
  })
  const n1 = mainNodes(result).find(n => n.id === 'n1')
  assertEquals(n1.then, ['n3'])
})

Deno.test('remove_node: dialog.then 참조 → 자식으로 재배선', () => {
  // main.then=['n1'], n1.then=['n2'] → remove n1 → main.then=['n2']
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'remove_node', nodeId: 'n1',
  })
  assertEquals(mainDialog(result).then, ['n2'])
})

Deno.test('remove_node: 자식 없는 노드 삭제 — dangling then 없음', () => {
  // n3.then=['n4'], n4.then=[] → remove n4 → n3.then=[]
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'remove_node', nodeId: 'n4',
  })
  const n3 = mainNodes(result).find(n => n.id === 'n3')
  assertEquals(n3.then, [])
  assertEquals(mainNodes(result).find(n => n.id === 'n4'), undefined)
})

Deno.test('remove_node: 비대상 노드·dialog 보존', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'remove_node', nodeId: 'n4',
  })
  assertEquals(mainNodes(result).find(n => n.id === 'n3')?.label, '저장1')
  assertEquals(preNodes(result)[0].config.items[0].text[0].texts, ['사전 멘트'])
})

Deno.test('remove_node: changedNodeIds = [nodeId]', () => {
  const { changedNodeIds } = applyEditPatch(makeFlow(), {
    op: 'remove_node', nodeId: 'n2',
  })
  assertEquals(changedNodeIds, ['n2'])
})

// ── add_node ──────────────────────────────────────────────────────────────────

Deno.test('add_node: parentId 있으면 parent.then에 추가', () => {
  const newNode = { id: 'n99', type: 'output', label: '새 노드', then: [] }
  const { flow: result, changedNodeIds } = applyEditPatch(makeFlow(), {
    op: 'add_node', dialogId: 'main', node: newNode, parentId: 'n4',
  })
  assertExists(mainNodes(result).find(n => n.id === 'n99'))
  const n4 = mainNodes(result).find(n => n.id === 'n4')
  assertEquals(n4.then, ['n99'])
  assertEquals(changedNodeIds, ['n99'])
})

Deno.test('add_node: parentId 없으면 dialog.then에 추가', () => {
  const newNode = { id: 'n99', type: 'output', then: [] }
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'add_node', dialogId: 'main', node: newNode,
  })
  assertExists(mainNodes(result).find(n => n.id === 'n99'))
  assertEquals(mainDialog(result).then.includes('n99'), true)
})

Deno.test('add_node: 기존 노드·dialog 보존', () => {
  const newNode = { id: 'n99', type: 'output', then: [] }
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'add_node', dialogId: 'main', node: newNode,
  })
  const n1 = mainNodes(result).find(n => n.id === 'n1')
  assertEquals(n1.label, '출력1')
  assertEquals(preNodes(result)[0].then, [])
})

// ── set_branch ────────────────────────────────────────────────────────────────

Deno.test('set_branch: 대상 노드의 condition·then 설정', () => {
  const { flow: result, changedNodeIds } = applyEditPatch(makeFlow(), {
    op: 'set_branch', nodeId: 'n2', condition: 'answer == Y', then: ['n3', 'n4'],
  })
  const n2 = mainNodes(result).find(n => n.id === 'n2')
  assertEquals(n2.condition, 'answer == Y')
  assertEquals(n2.then, ['n3', 'n4'])
  assertEquals(changedNodeIds, ['n2'])
})

Deno.test('set_branch: 비대상 노드 condition·then 보존', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'set_branch', nodeId: 'n2', condition: 'x', then: ['n4'],
  })
  const n3 = mainNodes(result).find(n => n.id === 'n3')
  assertEquals(n3.condition, 'var == 1')
  assertEquals(n3.then, ['n4'])
})

// ── remove_branch ─────────────────────────────────────────────────────────────

Deno.test('remove_branch: condition 일치하면 삭제 + then 빈 배열', () => {
  const { flow: result, changedNodeIds } = applyEditPatch(makeFlow(), {
    op: 'remove_branch', nodeId: 'n3', condition: 'var == 1',
  })
  const n3 = mainNodes(result).find(n => n.id === 'n3')
  assertEquals(n3.condition, undefined)
  assertEquals(n3.then, [])
  assertEquals(changedNodeIds, ['n3'])
})

Deno.test('remove_branch: 비대상 노드 보존', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'remove_branch', nodeId: 'n3', condition: 'var == 1',
  })
  const n1 = mainNodes(result).find(n => n.id === 'n1')
  assertEquals(n1.then, ['n2'])
})

Deno.test('remove_branch: condition 불일치면 노드 무변경', () => {
  const { flow: result } = applyEditPatch(makeFlow(), {
    op: 'remove_branch', nodeId: 'n3', condition: 'other == 9',
  })
  const n3 = mainNodes(result).find(n => n.id === 'n3')
  assertEquals(n3.condition, 'var == 1')
  assertEquals(n3.then, ['n4'])
})

// ── replace_flow ──────────────────────────────────────────────────────────────

Deno.test('replace_flow: 전체 flow 교체', () => {
  const newFlow = { id: 'new', name: '교체 플로우', dialogs: [] }
  const { flow: result, changedNodeIds } = applyEditPatch(makeFlow(), {
    op: 'replace_flow', flow: newFlow,
  })
  assertEquals(result.id, 'new')
  assertEquals(result.name, '교체 플로우')
  assertEquals(result.dialogs.length, 0)
  assertEquals(changedNodeIds, [])
})

Deno.test('replace_flow: 배열에 포함돼도 전체 교체 + changedNodeIds 빈 배열', () => {
  const newFlow = { id: 'snap', name: '스냅샷', dialogs: [] }
  const { flow: result, changedNodeIds } = applyEditPatch(makeFlow(), [
    { op: 'set_ment', nodeId: 'n1', texts: ['무시됨'] },
    { op: 'replace_flow', flow: newFlow },
  ])
  assertEquals(result.id, 'snap')
  assertEquals(changedNodeIds, [])
})

// ── 입력 flow 불변 (순수 함수) ────────────────────────────────────────────────

Deno.test('set_ment: 입력 flow 불변', () => {
  const flow = makeFlow()
  const before = JSON.stringify(flow)
  applyEditPatch(flow, { op: 'set_ment', nodeId: 'n1', texts: ['변경'] })
  assertEquals(JSON.stringify(flow), before)
})

Deno.test('update_node: 입력 flow 불변', () => {
  const flow = makeFlow()
  const before = JSON.stringify(flow)
  applyEditPatch(flow, { op: 'update_node', nodeId: 'n2', changes: { label: '변경' } })
  assertEquals(JSON.stringify(flow), before)
})

Deno.test('remove_node: 입력 flow 불변', () => {
  const flow = makeFlow()
  const before = JSON.stringify(flow)
  applyEditPatch(flow, { op: 'remove_node', nodeId: 'n4' })
  assertEquals(JSON.stringify(flow), before)
})

Deno.test('add_node: 입력 flow 불변', () => {
  const flow = makeFlow()
  const before = JSON.stringify(flow)
  applyEditPatch(flow, {
    op: 'add_node', dialogId: 'main', node: { id: 'x', type: 'output' },
  })
  assertEquals(JSON.stringify(flow), before)
})

Deno.test('replace_flow: 입력 flow 불변', () => {
  const flow = makeFlow()
  const before = JSON.stringify(flow)
  applyEditPatch(flow, { op: 'replace_flow', flow: { id: 'x', dialogs: [] } })
  assertEquals(JSON.stringify(flow), before)
})

// ── changedNodeIds 정확성 ─────────────────────────────────────────────────────

Deno.test('changedNodeIds: 배열 패치 — 여러 nodeId 수집(중복 제거)', () => {
  const { changedNodeIds } = applyEditPatch(makeFlow(), [
    { op: 'set_ment', nodeId: 'n1', texts: ['a'] },
    { op: 'update_node', nodeId: 'n2', changes: { label: 'b' } },
    { op: 'remove_node', nodeId: 'n1' }, // n1 중복
  ])
  assertEquals(changedNodeIds.length, 2)
  assertEquals(changedNodeIds.includes('n1'), true)
  assertEquals(changedNodeIds.includes('n2'), true)
})

// ── 다중 op 순서 적용 ─────────────────────────────────────────────────────────

Deno.test('다중 op 배열: 순서대로 누적 적용', () => {
  const { flow: result } = applyEditPatch(makeFlow(), [
    { op: 'set_ment', nodeId: 'n1', texts: ['첫 변경'] },
    { op: 'update_node', nodeId: 'n2', changes: { label: '두 번째 변경' } },
  ])
  assertEquals(mainNodes(result).find(n => n.id === 'n1').config.items[0].text[0].texts, ['첫 변경'])
  assertEquals(mainNodes(result).find(n => n.id === 'n2').label, '두 번째 변경')
})

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { findIncompleteNodes } from "./findIncompleteNodes.js"

const orig = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: ['root'] },
      { id: 'root', type: 'output', label: '루트', config: { items: [{ type: 'text', text: [{ texts: ['안녕'] }] }] }, condition: '진입', then: [] },
    ],
    then: ['w', 'root'],
  }],
}

function withAdded(added) {
  return { dialogs: [{ id: 'main', nodes: [...orig.dialogs[0].nodes, ...added], then: ['w', 'root'] }] }
}

Deno.test("새 output 노드 멘트 비면 미완성", () => {
  const flow = withAdded([{ id: 'n1', type: 'output', label: '', config: {}, then: [] }])
  const r = findIncompleteNodes(flow, orig)
  assertEquals(r.length, 1)
  assertEquals(r[0].nodeId, 'n1')
  assertEquals(r[0].message, '안내 노드: 멘트가 비어 있습니다')
})

Deno.test("새 output 노드 멘트 채우면 통과", () => {
  const flow = withAdded([{ id: 'n1', type: 'output', config: { items: [{ type: 'text', text: [{ texts: ['채움'] }] }] }, then: [] }])
  assertEquals(findIncompleteNodes(flow, orig), [])
})

Deno.test("새 set/api/esd/llmchat/subflow 미완성 검출", () => {
  const flow = withAdded([
    { id: 's', type: 'set', config: { items: [{ key: '' }] }, then: [] },
    { id: 'a', type: 'api', config: { apiName: '' }, then: [] },
    { id: 'e', type: 'esd', config: { schemaName: '' }, then: [] },
    { id: 'l', type: 'llmchat', config: { prompt: '' }, then: [] },
    { id: 'sd', type: 'subflow', config: { loop: { condition: '' } }, then: [] },
  ])
  const ids = findIncompleteNodes(flow, orig).map((x) => x.nodeId).sort()
  assertEquals(ids, ['a', 'e', 'l', 's', 'sd'])
})

Deno.test("기존 노드는 검사 대상 아님(오탐 방지)", () => {
  // 기존 노드를 내용 없이 두어도(예: root의 config를 비워도) 원본에 있으므로 무시
  const flow = { dialogs: [{ id: 'main', nodes: [{ id: 'w', type: 'greeting', then: [] }, { id: 'root', type: 'output', config: {}, then: [] }], then: ['w', 'root'] }] }
  assertEquals(findIncompleteNodes(flow, orig), [])
})

Deno.test("분기(node) 노드는 내용 검사 없음", () => {
  const flow = withAdded([{ id: 'b', type: 'node', label: '분기', config: {}, then: [] }])
  assertEquals(findIncompleteNodes(flow, orig), [])
})

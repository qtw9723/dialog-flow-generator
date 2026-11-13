import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { getMentText, buildNodeMap } from "./nodeDiffHelpers.js"

Deno.test('getMentText: 멘트 텍스트를 / 구분자로 합산한다', () => {
  const node = {
    config: {
      items: [
        { text: [{ texts: ['안녕하세요'] }, { texts: ['반갑습니다'] }] },
        { text: [{ texts: ['도움말'] }] },
      ],
    },
  }
  assertEquals(getMentText(node), '안녕하세요 / 반갑습니다 / 도움말')
})

Deno.test('getMentText: 텍스트가 없으면 null 반환', () => {
  assertEquals(getMentText(null), null)
  assertEquals(getMentText(undefined), null)
  assertEquals(getMentText({}), null)
  assertEquals(getMentText({ config: { items: [] } }), null)
})

Deno.test('getMentText: falsy 텍스트 항목은 무시한다', () => {
  const node = { config: { items: [{ text: [{ texts: ['', null, '안녕'] }] }] } }
  assertEquals(getMentText(node), '안녕')
})

Deno.test('buildNodeMap: 다이얼로그 내 노드를 id 맵으로 변환한다', () => {
  const flowJson = {
    dialogs: [
      { nodes: [{ id: 'n1', type: 'output' }, { id: 'n2', type: 'input' }] },
      { nodes: [{ id: 'n3', type: 'set' }] },
    ],
  }
  const map = buildNodeMap(flowJson)
  assertEquals(Object.keys(map).sort(), ['n1', 'n2', 'n3'])
  assertEquals(map['n1'].type, 'output')
  assertEquals(map['n3'].type, 'set')
})

Deno.test('buildNodeMap: null/undefined/빈 플로우는 빈 맵 반환', () => {
  assertEquals(buildNodeMap(null), {})
  assertEquals(buildNodeMap(undefined), {})
  assertEquals(buildNodeMap({}), {})
  assertEquals(buildNodeMap({ dialogs: [] }), {})
})

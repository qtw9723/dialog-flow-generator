import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { findAmbiguousBranches } from "./findAmbiguousBranches.js"

// 상담봇 케이스 재현: ESD 조회 노드가 조건 없이 2갈래(둘 다 조건 없음)로 나뉨
function ambiguousFlow() {
  return {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'esd1', type: 'esd', label: '조회', condition: '진입', then: ['found', 'nset'] },
        { id: 'found', type: 'node', label: '성공/실패 분기', then: [] },   // condition 없음
        { id: 'nset', type: 'set', label: 'ㅇㅇ', then: [] },                 // condition 없음
        { id: 'ae', type: 'fallback', then: [] },
      ],
      then: ['esd1', 'ae'],
    }],
  }
}

Deno.test("조건 없는 갈래 2개 → 모호 분기로 검출", () => {
  const r = findAmbiguousBranches(ambiguousFlow())
  assertEquals(r.length, 1)
  assertEquals(r[0].nodeId, 'esd1')
  assertEquals(r[0].count, 2)
})

Deno.test("한 갈래에만 조건 없으면(else) 통과", () => {
  const f = ambiguousFlow()
  f.dialogs[0].nodes.find((n) => n.id === 'found').condition = 'local.x != null'
  assertEquals(findAmbiguousBranches(f), [])
})

Deno.test("두 갈래 모두 조건 있으면 통과", () => {
  const f = ambiguousFlow()
  f.dialogs[0].nodes.find((n) => n.id === 'found').condition = 'local.x != null'
  f.dialogs[0].nodes.find((n) => n.id === 'nset').condition = 'local.x == null'
  assertEquals(findAmbiguousBranches(f), [])
})

Deno.test("단일 연결(분기 아님)은 조건 없어도 통과", () => {
  const f = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'a', type: 'output', label: 'A', condition: '진입', then: ['b'] },
        { id: 'b', type: 'output', label: 'B', then: [] },
      ],
      then: ['a'],
    }],
  }
  assertEquals(findAmbiguousBranches(f), [])
})

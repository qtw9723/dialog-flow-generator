import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { findIsolatedNodes } from "./findIsolatedNodes.js"

// deriveStructure 기준 판정이므로 fixture는 실제 flow 구조(dialog.then 루트, greeting/fallback boiler)로 구성.

// 정상: greeting→greet + 분기 시나리오 root→[b1,b2] + 에러 종결 노드(브랜치로 연결)
function makeConnectedFlow() {
  return {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['greet'] },
        { id: 'greet', type: 'output', label: '환영', then: [] },
        { id: 'root', type: 'node', label: "사용자가 '배송 조회'로 진입했는지 판별한다", condition: "input.text.includes('배송')", then: ['b1', 'err'] },
        { id: 'b1', type: 'output', label: '배송 안내', then: [] },
        { id: 'err', type: 'output', label: '에러 메시지', condition: '_error', then: [] },
        { id: 'ae', type: 'fallback', then: [] },
      ],
      then: ['w', 'root', 'ae'],
    }],
  }
}

Deno.test("연결된 시나리오 루트·종결(에러) 노드 → 고립 아님(오탐 방지)", () => {
  assertEquals(findIsolatedNodes(makeConnectedFlow()), [])
})

Deno.test("추가한 홀로 떨어진 노드(조건 없는 루트) → 고립으로 검출", () => {
  const flow = makeConnectedFlow()
  const main = flow.dialogs[0]
  main.nodes.push({ id: 'n_new', type: 'output', label: '새 노드', then: [] })  // 진입 조건 없음
  main.then.push('n_new')  // 루트로 얹혔지만 아무것도 연결 안 됨
  const iso = findIsolatedNodes(flow)
  assertEquals(iso.length, 1)
  assertEquals(iso[0].nodeId, 'n_new')
})

Deno.test("시작 노드(진입 조건 있는 루트)는 엣지 없어도 제외 — 오탐 방지 핵심", () => {
  // 편집 파이프라인이 시작 노드의 then을 일시적으로 비워 고립처럼 보여도, 진입 조건 있는 루트면 제외.
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['greet'] },
        { id: 'greet', type: 'output', then: [] },
        { id: 's1', type: 'node', label: "배송 조회 판별", condition: "input.text.includes('배송')", then: [] },  // 조건 있는 루트, then 비었어도 시작점
        { id: 's2', type: 'node', label: "주문 취소 판별", condition: "input.text.includes('취소')", then: [] },
      ],
      then: ['w', 's1', 's2'],
    }],
  }
  assertEquals(findIsolatedNodes(flow), [])
})

Deno.test("조건 없는 childless 루트는 시작점으로 안 봄 → 검출", () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['greet'] },
        { id: 'greet', type: 'output', then: [] },
        { id: 'lone', type: 'output', label: '떠돌이', then: [] },  // 루트지만 조건 없음
      ],
      then: ['w', 'lone'],
    }],
  }
  assertEquals(findIsolatedNodes(flow).map(i => i.nodeId), ['lone'])
})

Deno.test("boiler(greeting·fallback)는 고립으로 보지 않음", () => {
  // greeting이 then 없이 홀로여도 boiler라 deriveStructure가 제외
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: [] },
        { id: 'root', type: 'node', label: 'r', then: ['e'] },
        { id: 'e', type: 'output', then: [] },
        { id: 'ae', type: 'fallback', then: [] },
      ],
      then: ['w', 'root', 'ae'],
    }],
  }
  assertEquals(findIsolatedNodes(flow), [])
})

Deno.test("루프 본문 노드는 body 소속으로 연결 인정 → 고립 아님", () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['root'] },
        { id: 'root', type: 'node', label: 'r', then: ['loop'] },
        { id: 'loop', type: 'subflow', label: '반복', config: { loop: { count: '3' } }, body: ['b1'], then: ['done'] },
        { id: 'b1', type: 'output', label: '입력', then: [] },
        { id: 'done', type: 'output', label: '완료', then: [] },
      ],
      then: ['w', 'root'],
    }],
  }
  assertEquals(findIsolatedNodes(flow), [])
})

Deno.test("여러 고립 노드 수집", () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['greet'] },
        { id: 'greet', type: 'output', then: [] },
        { id: 'x', type: 'output', label: '떠돌이1', then: [] },
        { id: 'y', type: 'output', label: '떠돌이2', then: [] },
      ],
      then: ['w', 'x', 'y'],
    }],
  }
  assertEquals(findIsolatedNodes(flow).map(i => i.nodeId).sort(), ['x', 'y'])
})

Deno.test("main dialog 없음/빈 flow → 고립 없음(크래시 없음)", () => {
  assertEquals(findIsolatedNodes(null), [])
  assertEquals(findIsolatedNodes({}), [])
  assertEquals(findIsolatedNodes({ dialogs: [] }), [])
})

Deno.test("조건 없는 노드가 루트로 얹혀 고립(추가 노드 케이스) → 검출, 기존/신규 무관", () => {
  // 기존 노드든 새 노드든, dialog.then에 조건 없이 얹힌 고립 노드는 검출된다(신규 한정 아님).
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: ['greet'] },
        { id: 'greet', type: 'output', then: [] },
        { id: 's1', type: 'node', condition: "input.text.includes('배송')", then: ['mid'] },
        { id: 'mid', type: 'output', then: [] },
        { id: 'floating', type: 'output', label: '떠돌이(조건X 루트)', then: [] },
      ],
      then: ['w', 's1', 'floating'],
    }],
  }
  assertEquals(findIsolatedNodes(flow).map(i => i.nodeId), ['floating'])
})

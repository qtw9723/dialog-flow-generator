import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { findShadowedBranches } from "./findShadowedBranches.js"

// 분기 노드 b의 갈래들을 주어진 조건 순서대로 만든다.
function branchFlow(conds, extra = {}) {
  const kids = conds.map((c, i) => ({ id: `k${i}`, type: 'output', label: `갈래${i}`, ...(c == null ? {} : { condition: c }), then: [] }))
  return {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'b', type: 'node', label: '회원 분기', condition: '진입', then: kids.map((k) => k.id) },
        ...kids,
        ...(extra.nodes || []),
      ],
      then: ['b', ...(extra.rootThen || [])],
    }],
  }
}

Deno.test("else가 마지막이면 가려진 갈래 없음", () => {
  assertEquals(findShadowedBranches(branchFlow(['local.a == 1', 'local.a == 2', null])), [])
})

Deno.test("빈 조건 갈래 뒤의 형제는 가려짐(reason=empty)", () => {
  const r = findShadowedBranches(branchFlow([null, 'local.a == 1', 'local.a == 2']))
  assertEquals(r.length, 1)
  assertEquals(r[0].nodeId, 'b')
  assertEquals(r[0].label, '회원 분기')
  assertEquals(r[0].reason, 'empty')
  assertEquals(r[0].blockerId, 'k0')
  assertEquals(r[0].shadowed.map((s) => s.id), ['k1', 'k2'])
})

Deno.test("빈 조건 갈래 2개면 두 번째가 가려짐", () => {
  const r = findShadowedBranches(branchFlow(['local.a == 1', null, null]))
  assertEquals(r.map((x) => [x.reason, x.blockerId, x.shadowed.map((s) => s.id)]), [['empty', 'k1', ['k2']]])
})

Deno.test("조건이 true 글자 그대로면 항상 참 — 뒤 형제 가려짐(reason=always_true)", () => {
  const r = findShadowedBranches(branchFlow(['local.a == 1', ' true ', 'local.a == 2']))
  assertEquals(r.map((x) => [x.reason, x.blockerId, x.shadowed.map((s) => s.id)]), [['always_true', 'k1', ['k2']]])
})

Deno.test("앞 갈래와 같은 조건이면 뒤 갈래가 가려짐(reason=duplicate, 공백 차이 무시)", () => {
  const r = findShadowedBranches(branchFlow(['local.a == 1', 'local.a  ==  1', null]))
  assertEquals(r.map((x) => [x.reason, x.blockerId, x.shadowed.map((s) => s.id)]), [['duplicate', 'k0', ['k1']]])
})

Deno.test("config.condition도 조건으로 인정(normalizeElseOrder와 같은 기준)", () => {
  const f = branchFlow([null, null])
  f.dialogs[0].nodes.find((n) => n.id === 'k0').config = { condition: 'local.a == 1' }
  assertEquals(findShadowedBranches(f), [])
})

Deno.test("갈래 하위 흐름 안의 분기도 검사(중첩 then)", () => {
  const f = branchFlow(['local.member == true', null])
  const nodes = f.dialogs[0].nodes
  nodes.find((n) => n.id === 'k0').then = ['sub']
  nodes.push(
    { id: 'sub', type: 'node', label: '등급 분기', then: ['g0', 'g1'] },
    { id: 'g0', type: 'output', label: 'VIP', then: [] },
    { id: 'g1', type: 'output', label: '일반', condition: 'local.grade == "N"', then: [] },
  )
  const r = findShadowedBranches(f)
  assertEquals(r.map((x) => [x.nodeId, x.shadowed.map((s) => s.label)]), [['sub', ['일반']]])
})

Deno.test("시나리오 루트(dialog.then)는 대상 아님 — findConditionlessRoots 소관", () => {
  const f = branchFlow(['local.a == 1', null], { nodes: [{ id: 'r2', type: 'node', label: '다른 시나리오', then: [] }], rootThen: ['r2'] })
  f.dialogs[0].nodes.find((n) => n.id === 'b').condition = ''
  assertEquals(findShadowedBranches(f), [])
})

Deno.test("갈래 1개·then 없음·dialogs 없음은 안전하게 빈 배열", () => {
  assertEquals(findShadowedBranches(branchFlow([null])), [])
  assertEquals(findShadowedBranches({}), [])
  assertEquals(findShadowedBranches(null), [])
})

Deno.test("main 외 다이얼로그도 검사하고 dialogId를 남긴다", () => {
  const f = branchFlow(['local.a == 1', null])
  f.dialogs.push({ id: 'sub1', then: ['x'], nodes: [
    { id: 'x', type: 'node', label: '서브 분기', then: ['y0', 'y1'] },
    { id: 'y0', type: 'output', then: [] },
    { id: 'y1', type: 'output', condition: 'local.b', then: [] },
  ] })
  const r = findShadowedBranches(f)
  assertEquals(r.map((x) => [x.dialogId, x.nodeId, x.shadowed.map((s) => s.label)]), [['sub1', 'x', ['y1']]])
})

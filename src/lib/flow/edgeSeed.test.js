import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { seedEdgeVisual } from "./edgeSeed.js"

// 편집기 시드 계약: 캔버스 엣지 data.condition이 조건 편집기의 소스 오브 트루스다.
// buildLayout이 이걸 안 실으면 기존 조건을 편집하려 할 때 편집기가 빈 값으로 뜬다.

Deno.test("분기 엣지에 조건이 있으면 data.condition에 원본 조건식이 실린다", () => {
  const r = seedEdgeVisual({ condition: "input.text.includes('취소')", isBranch: true, readOnly: false })
  assertEquals(r.type, 'branchEdge')
  assertEquals(r.data.condition, "input.text.includes('취소')")
  assertEquals(r.data.label, '취소')
  assertEquals(r.data.warn, false)
})

Deno.test("비분기 엣지라도 타겟에 진입 조건이 있으면 data.condition이 실린다", () => {
  // 출력 1개짜리 엣지엔 라벨을 안 붙이지만, 편집기는 여전히 조건을 보여줘야 한다.
  const r = seedEdgeVisual({ condition: "local.status == 'paid'", isBranch: false, readOnly: false })
  assertEquals(r.type, 'smoothstep')
  assertEquals(r.data.condition, "local.status == 'paid'")
})

Deno.test("턴 경계(응답 대기) 엣지도 조건을 보존한다", () => {
  const r = seedEdgeVisual({ condition: '_result != null', isBranch: false, turn: true, readOnly: false })
  assertEquals(r.type, 'waitEdge')
  assertEquals(r.data.condition, '_result != null')
})

Deno.test("조건이 없으면 data.condition을 만들지 않는다 — canvasToFlow가 원본을 건드리지 않도록", () => {
  const r = seedEdgeVisual({ condition: '', isBranch: false, readOnly: false })
  assertEquals(r.type, 'smoothstep')
  assertEquals(r.data, undefined)
})

Deno.test("편집 모드에서 조건 없는 분기는 경고 라벨 (기존 동작 유지)", () => {
  const r = seedEdgeVisual({ condition: '', isBranch: true, readOnly: false, targetLabel: '배송 안내', emptyCount: 2 })
  assertEquals(r.type, 'branchEdge')
  assertEquals(r.data.label, '⚠ 조건 없음')
  assertEquals(r.data.warn, true)
  assertEquals(r.data.condition, undefined)
})

Deno.test("읽기전용에서 조건 없는 분기는 타겟 라벨로 폴백 (기존 동작 유지)", () => {
  const r = seedEdgeVisual({ condition: '', isBranch: true, readOnly: true, targetLabel: '배송 안내', emptyCount: 2 })
  assertEquals(r.type, 'branchEdge')
  assertEquals(r.data.label, '배송 안내')
  assertEquals(r.data.warn, false)
})

Deno.test("분기면 턴 경계여도 조건 라벨이 이긴다 (기존 동작 유지)", () => {
  const r = seedEdgeVisual({ condition: "input.text.includes('네')", isBranch: true, turn: true, readOnly: false })
  assertEquals(r.type, 'branchEdge')
  assertEquals(r.data.label, '네')
})

Deno.test("공백만 있는 조건은 조건 없음으로 취급", () => {
  const r = seedEdgeVisual({ condition: '   ', isBranch: false, readOnly: false })
  assertEquals(r.data, undefined)
})

// ─── 통합: deriveStructure가 준 구조 엣지 → 편집기가 읽는 data.condition ───
// (FlowCanvas.buildLayout이 이 두 단계를 잇는다. 회귀: 조건이 라벨로만 소비되고 data엔 안 실림)
Deno.test("통합: 실제 flow의 분기 조건이 편집기 시드까지 도달한다", async () => {
  const { deriveStructure } = await import('../refDiagram.js')
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'root', type: 'node', label: '주문 문의 판별', condition: "input.text.includes('주문')", then: ['cancel', 'track'] },
        { id: 'cancel', type: 'output', label: '취소 안내', condition: "input.text.includes('취소')", then: [] },
        { id: 'track', type: 'output', label: '배송 조회 안내', condition: "local.status == 'shipped'", then: [] },
      ],
      then: ['root'],
    }],
  }
  const st = deriveStructure(flow)
  const outDeg = {}
  for (const e of st.edges) outDeg[e.from] = (outDeg[e.from] || 0) + 1

  const seeded = st.edges.map((e) => ({
    id: `e-${e.from}-${e.to}`,
    ...seedEdgeVisual({
      condition: e.condition,
      isBranch: (outDeg[e.from] || 0) >= 2,
      turn: false,
      readOnly: false,
      targetLabel: e.label,
    }),
  }))

  // handleSelectionChange가 하는 일: one.data?.condition || ''
  const condOf = (id) => seeded.find((s) => s.id === id)?.data?.condition || ''
  assertEquals(condOf('e-root-cancel'), "input.text.includes('취소')")
  assertEquals(condOf('e-root-track'), "local.status == 'shipped'")

  // 그리고 그 값이 빌더 필드로 되살아나야 한다(편집기 시드)
  const { parseCondition } = await import('./conditionBuilder.js')
  assertEquals(parseCondition(condOf('e-root-cancel')), { subject: 'input.text', operator: 'includes', value: '취소' })
  assertEquals(parseCondition(condOf('e-root-track')), { subject: 'local.status', operator: 'eq', value: 'shipped' })
})

// ─── else(그 외) 갈래 ───
// findAmbiguousBranches가 "조건 없는 갈래 1개는 else로 허용"하는데 캔버스는 목적지 라벨을 넣어
// 조건인 척 보이게 했다. 실제 의미는 "형제 조건이 아닐 때"이므로 '그 외'로 표시한다.

Deno.test("분기에 조건 없는 갈래가 하나뿐이면 '그 외'로 표시한다", () => {
  const r = seedEdgeVisual({ condition: '', isBranch: true, readOnly: true, targetLabel: '조회 실패 안내', emptyCount: 1 })
  assertEquals(r.type, 'branchEdge')
  assertEquals(r.data.label, '그 외')
  assertEquals(r.data.warn, false)
  assertEquals(r.data.condition, undefined)
})

Deno.test("편집 모드에서도 단일 else 갈래는 경고가 아니라 '그 외'", () => {
  const r = seedEdgeVisual({ condition: '', isBranch: true, readOnly: false, targetLabel: '조회 실패 안내', emptyCount: 1 })
  assertEquals(r.data.label, '그 외')
  assertEquals(r.data.warn, false)
})

Deno.test("조건 없는 갈래가 2개면 else가 아니라 모호 — 경고 유지", () => {
  const edit = seedEdgeVisual({ condition: '', isBranch: true, readOnly: false, targetLabel: 'X', emptyCount: 2 })
  assertEquals(edit.data.label, '⚠ 조건 없음')
  assertEquals(edit.data.warn, true)
  const ro = seedEdgeVisual({ condition: '', isBranch: true, readOnly: true, targetLabel: 'X', emptyCount: 2 })
  assertEquals(ro.data.label, 'X')
})

Deno.test("조건이 있는 갈래는 emptyCount와 무관하게 그대로", () => {
  const r = seedEdgeVisual({ condition: "input.text.includes('취소')", isBranch: true, readOnly: true, emptyCount: 1 })
  assertEquals(r.data.label, '취소')
  assertEquals(r.data.condition, "input.text.includes('취소')")
})

Deno.test("분기가 아니면 emptyCount가 1이어도 '그 외'를 붙이지 않는다", () => {
  const r = seedEdgeVisual({ condition: '', isBranch: false, readOnly: true, targetLabel: '다음', emptyCount: 1 })
  assertEquals(r.type, 'smoothstep')
  assertEquals(r.data, undefined)
})

// 조건 없는(모호한) 분기 검출 (순수) — 다이어그램 편집 재검증 보강.
// 한 노드에서 2갈래 이상으로 나뉘는데(=분기) 조건 없는 갈래가 2개 이상이면, 엔진이 어느 길로
// 갈지 판단할 수 없다(모호). 이를 잡아 확정을 차단한다.
//   - 조건 없는 갈래가 1개면 'else(기본)'로 허용(나머지는 조건으로 결정).
//   - 판정은 다이어그램과 동일한 deriveStructure 기준(화면 분기 = then 2갈래+). 조건은 타겟의 진입 조건.
import { deriveStructure } from '../refDiagram.js'

function collect(edges, labelById, out, scope) {
  const byFrom = new Map()
  for (const e of (edges || [])) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, [])
    byFrom.get(e.from).push(e)
  }
  for (const [from, es] of byFrom) {
    if (es.length < 2) continue // 분기 아님
    const empties = es.filter((e) => !String(e.condition || '').trim())
    if (empties.length >= 2) {
      out.push({ nodeId: from, label: labelById.get(from) || from, count: empties.length, scope })
    }
  }
}

/**
 * @param {object} flow - 머신 다이얼로그 트리
 * @returns {Array<{nodeId:string,label:string,count:number,scope:'main'|'loop'}>}
 */
export function findAmbiguousBranches(flow) {
  const { nodes, edges, loops } = deriveStructure(flow || {})
  const labelById = new Map((nodes || []).map((n) => [n.id, n.label]))
  const out = []
  collect(edges, labelById, out, 'main')
  for (const l of (loops || [])) collect(l.bodyEdges, labelById, out, 'loop')
  return out
}

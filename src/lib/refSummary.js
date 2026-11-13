// 시나리오 레퍼런스 flow_json → 사람이 읽는 요약 파생.
// 수작업 설명과 달리 실물 구조에서 자동 파생되므로 레퍼런스가 바뀌어도 항상 일치한다.
// 파생 기준(greeting·fallback 제외, then-우선 DFS, __init 숨김)은 refShared.js가 refDiagram.js와 함께 강제한다.

import { TYPE_KO, walk, firstOutputText, getBoilerAndRoots } from './refShared.js'

// 반환: { steps: string[], collects: string[], firstMent: string, branchCount: number, nodeCount: number } | null
export function summarizeReference(flowJson) {
  const main = (flowJson?.dialogs || []).find((d) => d?.id === 'main')
  if (!main) return null
  const byId = new Map((main.nodes || []).map((n) => [n.id, n]))

  // 보일러플레이트(greeting·fallback 서브트리) 제외 — 생성기 scenarioPortion과 같은 기준
  const { boiler, roots } = getBoilerAndRoots(byId, main.then || [])
  const scenIds = walk(byId, roots, true)
  const nodes = (main.nodes || []).filter((n) => scenIds.has(n.id) && !boiler.has(n.id))
  if (nodes.length === 0) return null

  // 흐름 스텝: then 우선 DFS(메인 흐름) — body 내부와 생성기 내부 노드(__init 등)는 제외해 요약을 짧게 유지
  const steps = []
  const visited = new Set()
  const stack = [...roots].reverse()
  while (stack.length) {
    const id = stack.pop()
    if (!id || visited.has(id) || boiler.has(id) || !byId.has(id)) continue
    visited.add(id)
    const n = byId.get(id)
    for (let i = (n.then || []).length - 1; i >= 0; i--) stack.push(n.then[i])
    if (String(n.id).endsWith('__init')) continue
    const label = String(n.label || '').trim()
    steps.push(label || TYPE_KO[n.type] || n.type)
  }

  // 수집 항목: input 노드 + 사용자 입력을 저장하는 set 노드(value에 input 참조)
  const collects = nodes
    .filter((n) =>
      n.type === 'input' ||
      (n.type === 'set' && (n.config?.items || []).some((it) => String(it?.value || '').includes('input'))))
    .map((n) => String(n.label || '').trim().replace(/[을를]?\s*저장.*$/, ''))
    .filter(Boolean)
  const firstMent = nodes.map(firstOutputText).find(Boolean) || ''
  const branchCount = nodes.filter((n) => (n.then || []).length > 1).length

  return { steps, collects, firstMent, branchCount, nodeCount: nodes.length }
}

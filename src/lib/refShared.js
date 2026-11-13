// 시나리오 레퍼런스 flow_json 파생(refDiagram.js·refSummary.js)이 공유하는 기준.
// greeting·fallback 보일러플레이트 제외, then-우선 DFS, __init 숨김 — 이 파일이 그 기준을 강제한다.

export const TYPE_KO = {
  output: '안내', input: '입력', set: '저장', node: '분기', condition: '분기',
  subflow: '반복', llmchat: 'AI 응답', api: 'API 연동', esd: '기록 저장',
}

export function walk(byId, starts, includeBody) {
  const seen = new Set()
  const q = [...starts]
  while (q.length) {
    const id = q.shift()
    if (!id || seen.has(id) || !byId.has(id)) continue
    seen.add(id)
    const n = byId.get(id)
    for (const t of (n.then || [])) q.push(t)
    if (includeBody) for (const b of (n.body || [])) q.push(b)
  }
  return seen
}

export function firstOutputText(node) {
  for (const item of node?.config?.items || []) {
    if (item?.type !== 'text') continue
    const t = item?.text?.[0]?.texts?.[0]
    if (t) return String(t)
  }
  return ''
}

export function getBoilerAndRoots(byId, mainThen) {
  const wId = mainThen.find(id => byId.get(id)?.type === 'greeting')
  const aId = mainThen.find(id => byId.get(id)?.type === 'fallback' || id === 'fallback')
  const boiler = new Set([
    ...walk(byId, wId ? [wId] : [], true),
    ...walk(byId, aId ? [aId] : [], true),
  ])
  const roots = mainThen.filter(id => id !== wId && id !== aId)
  return { boiler, roots }
}

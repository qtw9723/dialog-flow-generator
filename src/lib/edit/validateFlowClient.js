// validateFlow.ts / repairFlow.ts 의 클라이언트(브라우저) JS 버전.
// 순수 함수: fetch/IO/Deno.env 없음. validateFlow.ts와 로직 동일.

function computeSources(flow) {
  const targeted = new Set(flow.nodes.flatMap(n => [...(n.next || []), ...(n.loop?.body || [])]))
  const seed = new Set(flow.nodes.map(n => n.id).filter(id => !targeted.has(id)))
  if (flow.nodes.some(n => n.id === flow.entry)) seed.add(flow.entry)
  if (seed.size === 0 && flow.nodes.length > 0) seed.add(flow.nodes[0].id)
  return [...seed]
}

function reachableFrom(flow, seeds) {
  const ids = new Set(flow.nodes.map(n => n.id))
  const byId = new Map(flow.nodes.map(n => [n.id, n]))
  const reachable = new Set()
  const queue = seeds.filter(id => ids.has(id))
  while (queue.length > 0) {
    const id = queue.shift()
    if (reachable.has(id)) continue
    reachable.add(id)
    const node = byId.get(id)
    if (node) {
      for (const nx of node.next) if (ids.has(nx)) queue.push(nx)
      for (const b of (node.loop?.body || [])) if (ids.has(b)) queue.push(b)
    }
  }
  return reachable
}

export function validateFlow(flow, catalog) {
  const errors = []
  const types = new Set(catalog.map(c => c.type))
  const terminalTypes = new Set(catalog.filter(c => c.isTerminal).map(c => c.type))
  const ids = new Set(flow.nodes.map(n => n.id))

  if (!ids.has(flow.entry)) errors.push(`entry "${flow.entry}"가 노드 목록에 없음`)

  for (const n of flow.nodes) {
    if (!types.has(n.type)) errors.push(`노드 "${n.id}": 미지의 노드 종류 "${n.type}"`)
    for (const next of n.next) {
      if (!ids.has(next)) errors.push(`노드 "${n.id}": 끊긴 next 참조 "${next}"`)
    }
    if (n.type === 'loop') {
      const lp = n.loop
      if (!lp || !Array.isArray(lp.body) || lp.body.length === 0) {
        errors.push(`루프 "${n.id}": 본문(body)이 비었음`)
      }
      if (!lp || !lp.exitVar) {
        errors.push(`루프 "${n.id}": 탈출 변수(exitVar)가 없음`)
      } else {
        const bodyReach = reachableFrom(flow, lp.body)
        const hasSetter = flow.nodes.some(m => bodyReach.has(m.id) && m.type === 'set')
        if (!hasSetter) errors.push(`루프 "${n.id}": 본문에 탈출 변수 "${lp.exitVar}"를 설정할 set 노드가 없음`)
      }
    }
  }

  const reachable = reachableFrom(flow, computeSources(flow))
  for (const n of flow.nodes) {
    if (!reachable.has(n.id)) errors.push(`노드 "${n.id}": 어떤 루트에서도 도달 불가(고아 노드)`)
  }

  const hasTerminal = flow.nodes.some(
    n => reachable.has(n.id) && terminalTypes.has(n.type) && n.next.length === 0
  )
  if (!hasTerminal) errors.push('종결 노드(예: Output)로 끝나는 도달 가능한 경로가 없음')

  return { valid: errors.length === 0, errors }
}

export function repairFlow(flow, catalog) {
  const types = new Set(catalog.map(c => c.type))
  let repaired = false

  // 1) 미지 노드 종류 제거
  const keptNodes = flow.nodes.filter(n => {
    if (!types.has(n.type)) { repaired = true; return false }
    return true
  })
  const keptIds = new Set(keptNodes.map(n => n.id))

  // 2) 끊긴 next / loop.body 참조 제거. body가 전부 사라진 loop 노드 제거.
  const cleanedRaw = keptNodes.map(n => {
    const next = n.next.filter(nx => keptIds.has(nx))
    if (next.length !== n.next.length) repaired = true
    if (n.loop) {
      const body = n.loop.body.filter(b => keptIds.has(b))
      if (body.length !== n.loop.body.length) repaired = true
      return { ...n, next, loop: { ...n.loop, body } }
    }
    return { ...n, next }
  })
  const cleaned = cleanedRaw.filter(n => {
    if (n.type === 'loop' && (!n.loop || n.loop.body.length === 0)) { repaired = true; return false }
    return true
  })

  // 2.5) 루프 본문 fall-through/루프백 제거
  const cleanedById = new Map(cleaned.map(n => [n.id, n]))
  const stripFromBody = new Map()
  for (const L of cleaned) {
    if (L.type !== 'loop' || !L.loop || !Array.isArray(L.loop.body)) continue
    const roots = new Set(L.loop.body)
    const cont = new Set(L.next || [])
    const members = new Set()
    const queue = [...roots]
    while (queue.length) {
      const id = queue.shift()
      if (members.has(id) || cont.has(id) || !cleanedById.has(id)) continue
      members.add(id)
      for (const nx of (cleanedById.get(id).next || [])) if (!cont.has(nx)) queue.push(nx)
    }
    for (const id of members) {
      for (const nx of (cleanedById.get(id).next || [])) {
        if (!members.has(nx) || roots.has(nx)) {
          if (!stripFromBody.has(id)) stripFromBody.set(id, new Set())
          stripFromBody.get(id).add(nx)
        }
      }
    }
  }
  let deBackedged = stripFromBody.size === 0 ? cleaned : cleaned.map(n => {
    const drop = stripFromBody.get(n.id)
    if (!drop) return n
    const next = n.next.filter(nx => !drop.has(nx))
    if (next.length === n.next.length) return n
    repaired = true
    return { ...n, next }
  })

  // 2.6) 단일 부모 강제(트리 불변식)
  {
    const nById = new Map(deBackedged.map(n => [n.id, n]))
    const visited = new Set()
    const dropNext = new Map()
    const dropBody = new Map()
    const mark = (m, id, t) => { let s = m.get(id); if (!s) { s = new Set(); m.set(id, s) } s.add(t) }
    const visit = (id) => {
      visited.add(id)
      const node = nById.get(id)
      if (!node) return
      for (const nx of (node.next || [])) {
        if (!nById.has(nx)) continue
        if (visited.has(nx)) mark(dropNext, id, nx); else visit(nx)
      }
      for (const b of (node.loop?.body || [])) {
        if (!nById.has(b)) continue
        if (visited.has(b)) mark(dropBody, id, b); else visit(b)
      }
    }
    for (const r of computeSources({ ...flow, nodes: deBackedged })) if (!visited.has(r)) visit(r)
    if (dropNext.size > 0 || dropBody.size > 0) {
      repaired = true
      deBackedged = deBackedged.map(n => {
        const dn = dropNext.get(n.id), db = dropBody.get(n.id)
        if (!dn && !db) return n
        const next = dn ? n.next.filter(x => !dn.has(x)) : n.next
        const loop = (db && n.loop) ? { ...n.loop, body: n.loop.body.filter(x => !db.has(x)) } : n.loop
        return n.loop ? { ...n, next, loop } : { ...n, next }
      })
    }
  }

  // 3) 루트 stack 제거
  const preStackFlow = { ...flow, nodes: deBackedged }
  const rootSources = new Set(computeSources(preStackFlow))
  const rootStackIds = new Set(
    deBackedged.filter(n => n.type === 'stack' && rootSources.has(n.id) && n.next.length > 0).map(n => n.id)
  )
  const deStacked = rootStackIds.size > 0 ? deBackedged.filter(n => !rootStackIds.has(n.id)) : deBackedged
  if (rootStackIds.size > 0) repaired = true

  // 4) 고아 노드 제거
  const cleanedFlow = { ...flow, nodes: deStacked }
  const reachable = reachableFrom(cleanedFlow, computeSources(cleanedFlow))
  const finalNodes = deStacked.filter(n => reachable.has(n.id))
  if (finalNodes.length !== deStacked.length) repaired = true

  // 5) 최종 참조 재정리
  const finalIds = new Set(finalNodes.map(n => n.id))
  const rewired = finalNodes.map(n => {
    const next = n.next.filter(nx => finalIds.has(nx))
    if (next.length !== n.next.length) repaired = true
    if (n.loop) {
      const body = n.loop.body.filter(b => finalIds.has(b))
      if (body.length !== n.loop.body.length) repaired = true
      return { ...n, next, loop: { ...n.loop, body } }
    }
    return { ...n, next }
  })

  return { flow: { ...flow, nodes: rewired }, repaired }
}

import { FlowNode, FlowSpec, NodeCatalogEntry, ValidationResult } from "./types.ts"

// '소스 노드' = 다른 노드의 next로 참조되지 않는 노드 = 최상위 엔트리(루트).
// DialogFlow는 다중 엔트리 모델이다: greeting과 각 시나리오 진입점이 모두 루트(형제)이며
// 각자 트리거 조건으로 시작된다. 따라서 도달성은 단일 entry가 아니라 모든 소스에서 계산한다.
function computeSources(flow: FlowSpec): string[] {
  const targeted = new Set(flow.nodes.flatMap((n) => [...(n.next || []), ...(n.loop?.body || [])]))
  const seed = new Set(flow.nodes.map((n) => n.id).filter((id) => !targeted.has(id)))
  // entry는 항상 시작점으로 포함(혹시 들어오는 엣지가 있어도). 소스가 전혀 없으면(전부 순환) entry로 폴백.
  if (flow.nodes.some((n) => n.id === flow.entry)) seed.add(flow.entry)
  if (seed.size === 0 && flow.nodes.length > 0) seed.add(flow.nodes[0].id)
  return [...seed]
}

function reachableFrom(flow: FlowSpec, seeds: string[]): Set<string> {
  const ids = new Set(flow.nodes.map((n) => n.id))
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const reachable = new Set<string>()
  const queue = seeds.filter((id) => ids.has(id))
  while (queue.length > 0) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const node = byId.get(id)
    if (node) {
      for (const nx of node.next) if (ids.has(nx)) queue.push(nx)
      for (const b of node.loop?.body || []) if (ids.has(b)) queue.push(b)
    }
  }
  return reachable
}

// greeting 보장(결정론적 안전장치): flow에 greeting 노드가 없으면 인사말 greeting+output을 루트로 주입한다.
// 프롬프트는 greeting 생성을 100% 보장하지 못하므로(누락 시 메인에 인사가 사라짐) 코드에서 강제한다.
// greeting은 루트(형제), 그 아래 인사말 output 하나만(buildFlowPrompt의 greeting 구조 규칙과 동일).
// 인사말 멘트는 이후 fillValues 단계가 intent를 보고 채운다.
export function ensureGreeting(flow: FlowSpec): { flow: FlowSpec; injected: boolean } {
  if (flow.nodes.some((n) => n.type === "greeting")) return { flow, injected: false }
  const greetingOut: FlowNode = { id: "_greeting_out", type: "output", intent: "환영 인사와 봇 소개·이용 안내", next: [] }
  const greeting: FlowNode = { id: "_greeting", type: "greeting", intent: "환영 인사", next: [greetingOut.id] }
  return { flow: { ...flow, nodes: [greeting, greetingOut, ...flow.nodes] }, injected: true }
}

export function validateFlow(flow: FlowSpec, catalog: NodeCatalogEntry[]): ValidationResult {
  const errors: string[] = []
  const types = new Set(catalog.map((c) => c.type))
  const terminalTypes = new Set(catalog.filter((c) => c.isTerminal).map((c) => c.type))
  const ids = new Set(flow.nodes.map((n) => n.id))

  if (!ids.has(flow.entry)) errors.push(`entry "${flow.entry}"가 노드 목록에 없음`)

  for (const n of flow.nodes) {
    if (!types.has(n.type)) errors.push(`노드 "${n.id}": 미지의 노드 종류 "${n.type}"`)
    for (const next of n.next) {
      if (!ids.has(next)) errors.push(`노드 "${n.id}": 끊긴 next 참조 "${next}"`)
    }
    if (n.type === "loop") {
      const lp = n.loop
      if (!lp || !Array.isArray(lp.body) || lp.body.length === 0) {
        errors.push(`루프 "${n.id}": 본문(body)이 비었음`)
      }
      if (!lp || !lp.exitVar) {
        errors.push(`루프 "${n.id}": 탈출 변수(exitVar)가 없음`)
      } else {
        // 본문(전이 포함)에 exitVar를 set하는 노드가 있어야 무한루프 방지.
        const bodyReach = reachableFrom(flow, lp.body)
        const hasSetter = flow.nodes.some((m) => bodyReach.has(m.id) && m.type === "set")
        if (!hasSetter) errors.push(`루프 "${n.id}": 본문에 탈출 변수 "${lp.exitVar}"를 설정할 set 노드가 없음`)
      }
    }
  }

  // 모든 소스(루트)에서 도달 가능한 노드 집합
  const reachable = reachableFrom(flow, computeSources(flow))

  // 어떤 루트에서도 도달 불가한 노드(소스 없는 순환에 갇힌 노드)는 고아
  for (const n of flow.nodes) {
    if (!reachable.has(n.id)) errors.push(`노드 "${n.id}": 어떤 루트에서도 도달 불가(고아 노드)`)
  }

  // 종결 노드(종결 종류이면서 next가 빈) 최소 1개 — 도달 가능한 것
  const hasTerminal = flow.nodes.some(
    (n) => reachable.has(n.id) && terminalTypes.has(n.type) && n.next.length === 0,
  )
  if (!hasTerminal) errors.push("종결 노드(예: Output)로 끝나는 도달 가능한 경로가 없음")

  return { valid: errors.length === 0, errors }
}

export function repairFlow(flow: FlowSpec, catalog: NodeCatalogEntry[]): { flow: FlowSpec; repaired: boolean } {
  const types = new Set(catalog.map((c) => c.type))
  let repaired = false

  // 1) 미지 노드 종류 제거
  const keptNodes = flow.nodes.filter((n) => {
    if (!types.has(n.type)) { repaired = true; return false }
    return true
  })
  const keptIds = new Set(keptNodes.map((n) => n.id))

  // 2) 끊긴 next / loop.body 참조 제거. body가 전부 사라진 loop 노드는 제거.
  const cleanedRaw = keptNodes.map((n) => {
    const next = n.next.filter((nx) => keptIds.has(nx))
    if (next.length !== n.next.length) repaired = true
    if (n.loop) {
      const body = n.loop.body.filter((b) => keptIds.has(b))
      if (body.length !== n.loop.body.length) repaired = true
      return { ...n, next, loop: { ...n.loop, body } }
    }
    return { ...n, next }
  })
  const cleaned = cleanedRaw.filter((n) => {
    if (n.type === "loop" && (!n.loop || n.loop.body.length === 0)) { repaired = true; return false }
    return true
  })

  // 3) 시나리오 루트가 stack이면 제거(자식이 새 진입점=루트로 승격됨).
  //    stack은 흐름 조작(저장/처음으로/뒤로/복원/반복) 전용이라 시나리오 진입에 쓰면 안 된다.
  //    진입은 첫 기능 노드의 condition으로 트리거되므로, 잘못 끼워진 루트 stack을 빼고
  //    그 자식을 루트로 올리면 이후 단계가 자식에 진입 트리거 condition을 채운다.
  //    (자식 없는 잎 stack=흐름 중간/'처음으로' 동작은 보존 — 루트이면서 자식이 있는 경우만 제거.)

  // 2.5) 루프 본문은 self-contained subtree여야 한다(트리 불변식). 본문 노드의 next가
  //    (a) 본문 루트로 되돌아가거나(루프백), (b) 본문 밖 — 특히 루프 continuation(loop.next) — 으로
  //    나가면(fall-through), 펼친 트리에서 그 대상 노드의 부모가 둘이 되고/사이클이 생겨 에디터가
  //    dialog를 로드하지 못한다. 본문 진입은 loop.body로만, 탈출은 루프 기구로만 처리되므로,
  //    본문 노드의 next는 "본문 멤버이면서 루트가 아닌" 것만 남기고 나머지(escaping)는 제거한다.
  //    프롬프트의 "루프백/순환 금지" 지시를 결정론적으로도 강제한다(validateFlow는 그래프 도달성만 봐 못 잡음).
  const cleanedById = new Map(cleaned.map((n) => [n.id, n]))
  const stripFromBody = new Map<string, Set<string>>()  // nodeId → 제거할 next 대상
  for (const L of cleaned) {
    if (L.type !== "loop" || !L.loop || !Array.isArray(L.loop.body)) continue
    const roots = new Set(L.loop.body)
    const cont = new Set(L.next || [])
    // 본문 멤버 = 루트에서 next로 도달(연속 노드 cont로는 진입하지 않음 → fall-through 대상 식별).
    const members = new Set<string>()
    const queue = [...roots]
    while (queue.length) {
      const id = queue.shift()!
      if (members.has(id) || cont.has(id) || !cleanedById.has(id)) continue
      members.add(id)
      for (const nx of (cleanedById.get(id)!.next || [])) if (!cont.has(nx)) queue.push(nx)
    }
    // 본문 멤버의 next 중 "본문 밖" 또는 "본문 루트(재진입)"로 가는 것은 제거 대상.
    for (const id of members) {
      for (const nx of (cleanedById.get(id)!.next || [])) {
        if (!members.has(nx) || roots.has(nx)) {
          if (!stripFromBody.has(id)) stripFromBody.set(id, new Set())
          stripFromBody.get(id)!.add(nx)
        }
      }
    }
  }
  let deBackedged = stripFromBody.size === 0 ? cleaned : cleaned.map((n) => {
    const drop = stripFromBody.get(n.id)
    if (!drop) return n
    const next = n.next.filter((nx) => !drop.has(nx))
    if (next.length === n.next.length) return n
    repaired = true
    return { ...n, next }
  })

  // 2.6) 단일 부모 강제(트리 불변식, 일반): DialogFlow는 dialog를 '트리'로 렌더한다 — 프로덕션 레퍼런스 봇
  //   (레스토랑 128노드·샘플 보험사 137노드)도 전부 노드당 부모가 1개다. LLM이 분기 후 재합류(diamond)나
  //   shortcut을 만들면 어떤 노드의 부모가 둘이 되어 dialog가 로드되지 않는다. 루트에서 DFS 신장트리를
  //   뽑아, 이미 방문한 노드로 가는 next/loop.body 엣지(재합류·shortcut·잔여 순환)를 제거한다.
  //   각 노드는 자신의 트리 엣지로 여전히 도달 가능(고아 없음). 루프백/fall-through(2.5)와 합쳐 그래프→트리 보장.
  {
    const nById = new Map(deBackedged.map((n) => [n.id, n]))
    const visited = new Set<string>()
    const dropNext = new Map<string, Set<string>>()
    const dropBody = new Map<string, Set<string>>()
    const mark = (m: Map<string, Set<string>>, id: string, t: string) => {
      let s = m.get(id); if (!s) { s = new Set(); m.set(id, s) } s.add(t)
    }
    const visit = (id: string): void => {
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
      deBackedged = deBackedged.map((n) => {
        const dn = dropNext.get(n.id), db = dropBody.get(n.id)
        if (!dn && !db) return n
        const next = dn ? n.next.filter((x) => !dn.has(x)) : n.next
        const loop = (db && n.loop) ? { ...n.loop, body: n.loop.body.filter((x) => !db.has(x)) } : n.loop
        return n.loop ? { ...n, next, loop } : { ...n, next }
      })
    }
  }

  const preStackFlow: FlowSpec = { ...flow, nodes: deBackedged }
  const rootSources = new Set(computeSources(preStackFlow))
  const rootStackIds = new Set(
    deBackedged.filter((n) => n.type === "stack" && rootSources.has(n.id) && n.next.length > 0).map((n) => n.id),
  )
  const deStacked = rootStackIds.size > 0 ? deBackedged.filter((n) => !rootStackIds.has(n.id)) : deBackedged
  if (rootStackIds.size > 0) repaired = true

  // 4) 어떤 루트(소스)에서도 도달 불가한 고아 노드 제거 (소스 없는 순환 등)
  const cleanedFlow: FlowSpec = { ...flow, nodes: deStacked }
  const reachable = reachableFrom(cleanedFlow, computeSources(cleanedFlow))
  const finalNodes = deStacked.filter((n) => reachable.has(n.id))
  if (finalNodes.length !== deStacked.length) repaired = true

  // 5) 최종 참조 재정리: 2단계 이후(빈 loop 제거·destack·고아 제거)에 노드가 더 사라질 수 있어,
  //    그때 정리된 적 없는 next/loop.body 참조가 끊긴 채 남는다(예: loop 필드 없는 loop 노드 제거 시
  //    그를 가리키던 next). 살아남은 노드만 참조하도록 한 번 더 거른다 — 불변식: 출력에 끊긴 참조 없음.
  const finalIds = new Set(finalNodes.map((n) => n.id))
  const rewired = finalNodes.map((n) => {
    const next = n.next.filter((nx) => finalIds.has(nx))
    if (next.length !== n.next.length) repaired = true
    if (n.loop) {
      const body = n.loop.body.filter((b) => finalIds.has(b))
      if (body.length !== n.loop.body.length) repaired = true
      return { ...n, next, loop: { ...n.loop, body } }
    }
    return { ...n, next }
  })

  return { flow: { ...flow, nodes: rewired }, repaired }
}

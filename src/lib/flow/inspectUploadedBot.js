// 업로드한 솔루션 봇 JSON 구조 검사 (순수).
//
// ⚠ 생성기의 validateFlow를 쓰지 않는다 — 그쪽은 **미지 노드 타입을 에러로 낸다.**
// 실제 솔루션 봇의 노드 21종 중 편집기를 가진 건 7종뿐이고, 앞으로 모르는 타입이 더 나올 수
// 있다. 여기서는 **진짜 구조 파손만 차단**하고, 미지 타입은 정보로만 보고한다.
import { nodeTypeInfo, isEditableType } from './nodeTypeRegistry.js'

const BOILERPLATE = new Set(['greeting', 'fallback'])

// ⚠ node.body의 형태가 두 가지다:
//   생성기 생성 봇  — 노드 **객체** 배열(반복 본문 스텝)
//   실제 솔루션 봇 — 노드 **id 문자열** 배열(같은 dialog의 노드를 가리키는 참조)
// 객체만 노드로 세고, 문자열은 참조로 취급한다. 섞어 세면 type 없는 '노드'가 생긴다.
function* eachNode(json) {
  for (const d of json?.dialogs || []) {
    for (const n of d?.nodes || []) {
      yield [d.id, n]
      for (const b of n?.body || []) {
        if (b && typeof b === 'object' && !Array.isArray(b)) yield [d.id, b]
      }
    }
  }
}

/** node.body 안의 id 문자열 참조를 훑는다. */
function* eachBodyRef(json) {
  for (const d of json?.dialogs || []) {
    for (const n of d?.nodes || []) {
      for (const b of n?.body || []) if (typeof b === 'string') yield [n.id, b]
    }
  }
}

/**
 * @param {*} json 업로드한 dialog JSON
 * @returns {{ok: boolean, blocking: string[], info: {nodeCount:number, scenarioCount:number, dialogCount:number,
 *          typeCounts:Record<string,number>, unknownTypes:string[], editableCount:number, lockedCount:number,
 *          typelessCount:number, hasControls:boolean, name:string}}}
 */
export function inspectUploadedBot(json) {
  const blocking = []
  const info = {
    nodeCount: 0, scenarioCount: 0, dialogCount: 0,
    typeCounts: {}, unknownTypes: [], editableCount: 0, lockedCount: 0,
    hasControls: false, name: '', typelessCount: 0,
  }

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, blocking: ['JSON 객체가 아닙니다.'], info }
  }
  info.name = String(json.name || '').trim()
  info.hasControls = Object.prototype.hasOwnProperty.call(json, 'controls')

  const dialogs = json.dialogs
  if (!Array.isArray(dialogs) || dialogs.length === 0) {
    blocking.push('dialogs 배열이 없습니다. 솔루션에서 내보낸 챗봇 JSON이 맞는지 확인해 주세요.')
    return { ok: false, blocking, info }
  }
  info.dialogCount = dialogs.length

  const main = dialogs.find((d) => d?.id === 'main')
  if (!main) blocking.push('main 다이얼로그가 없습니다.')

  // 노드 집계 + id 수집
  const ids = new Set()
  const dupes = new Set()
  for (const [, n] of eachNode(json)) {
    info.nodeCount++
    const t = n?.type
    if (typeof t !== 'string' || !t) { info.typelessCount++; continue }
    info.typeCounts[t] = (info.typeCounts[t] || 0) + 1
    if (n?.id != null) {
      if (ids.has(n.id)) dupes.add(n.id)
      ids.add(n.id)
    }
  }
  if (info.nodeCount === 0) blocking.push('노드가 하나도 없습니다.')
  if (dupes.size > 0) blocking.push(`노드 id가 중복됩니다: ${[...dupes].slice(0, 5).join(', ')}`)

  for (const [t, c] of Object.entries(info.typeCounts)) {
    if (isEditableType(t)) info.editableCount += c
    else info.lockedCount += c
  }
  info.lockedCount += info.typelessCount
  info.unknownTypes = Object.keys(info.typeCounts)
    .filter((t) => !isEditableType(t) && !nodeTypeInfoKnown(t))
    .sort()

  // 끊긴 참조 — then/body가 가리키는 id가 존재하는가
  const dangling = []
  for (const [, n] of eachNode(json)) {
    for (const t of n?.then || []) {
      if (typeof t === 'string' && !ids.has(t)) dangling.push(`${n.id} → ${t}`)
    }
  }
  for (const d of dialogs) {
    for (const t of d?.then || []) {
      if (typeof t === 'string' && !ids.has(t)) dangling.push(`${d.id}.then → ${t}`)
    }
  }
  for (const [from, ref] of eachBodyRef(json)) {
    if (!ids.has(ref)) dangling.push(`${from}.body → ${ref}`)
  }
  if (dangling.length) {
    blocking.push(`끊긴 연결이 ${dangling.length}건 있습니다: ${dangling.slice(0, 3).join(', ')}`)
  }

  // 순환 — then 그래프에 사이클이 있는가(반복 subflow의 body는 제외하고 top-level만)
  if (hasCycle(json)) blocking.push('노드 연결에 순환이 있습니다(무한 반복 위험).')

  // 시나리오 수 — main.then에서 보일러플레이트 제외
  if (main) {
    const byId = new Map()
    for (const n of main.nodes || []) byId.set(n.id, n)
    info.scenarioCount = (main.then || []).filter((id) => {
      const n = byId.get(id)
      return n && !BOILERPLATE.has(n.type)
    }).length
  }

  return { ok: blocking.length === 0, blocking, info }
}

/** 레지스트리에 라벨이 등록돼 있는가(= 우리가 이름을 아는 타입인가). */
function nodeTypeInfoKnown(type) {
  const info = nodeTypeInfo(type)
  return info.label !== (typeof type === 'string' ? type : '알 수 없음') || info.editable
}

function hasCycle(json) {
  const next = new Map()
  for (const d of json?.dialogs || []) {
    for (const n of d?.nodes || []) next.set(n.id, (n.then || []).filter((x) => typeof x === 'string'))
  }
  const WHITE = 0, GREY = 1, BLACK = 2
  const color = new Map([...next.keys()].map((k) => [k, WHITE]))
  const stack = []
  for (const start of next.keys()) {
    if (color.get(start) !== WHITE) continue
    stack.push([start, 0])
    color.set(start, GREY)
    while (stack.length) {
      const top = stack[stack.length - 1]
      const kids = next.get(top[0]) || []
      if (top[1] >= kids.length) { color.set(top[0], BLACK); stack.pop(); continue }
      const child = kids[top[1]++]
      if (!next.has(child)) continue
      const c = color.get(child)
      if (c === GREY) return true
      if (c === WHITE) { color.set(child, GREY); stack.push([child, 0]) }
    }
  }
  return false
}

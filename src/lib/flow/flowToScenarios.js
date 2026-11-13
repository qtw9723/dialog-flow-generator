// flow(dialog JSON) → ScenarioLite[] 역추출 (순수).
//
// 업로드한 기존 챗봇에는 설문 응답이 없다. 자산 역파생(ESD·API·NLP)의 입력인
// ScenarioLite를 **flow 구조에서 되짚어** 만든다.
// deriveNlpData가 기대하는 shape: { name, trigger, collects, result, branches }
import { nodeTypeInfo } from './nodeTypeRegistry.js'

const BOILERPLATE = new Set(['greeting', 'fallback'])

/**
 * flow의 모든 다이얼로그 노드를 id로 색인한다 — 루프 body 자식이 main 밖에 있어도 찾히게.
 * (같은 id가 여러 다이얼로그에 있으면 나중 것이 이긴다.) 자산 귀속(`scenarioAssets.js`)이
 * 같은 색인을 재사용하므로 export한다 — 복제하지 말 것.
 */
export function indexNodes(flow) {
  const byId = new Map()
  for (const d of flow?.dialogs || []) for (const n of d?.nodes || []) byId.set(n.id, n)
  return byId
}

/**
 * main.then 중 시나리오 루트 id(순서 보존).
 * flowToScenarios가 돌려주는 배열과 **인덱스가 1:1**이다 — 자산 귀속이 이 대응에 의존하므로
 * 루트 열거를 여기 한 곳에만 둔다(두 벌이면 한쪽만 바뀌어 인텐트가 엉뚱한 시나리오에 붙는다).
 */
export function scenarioRootIds(flow) {
  const main = (flow?.dialogs || []).find((d) => d?.id === 'main')
  if (!main) return []
  const byId = indexNodes(flow)
  return (main.then || []).filter((id) => {
    const n = byId.get(id)
    return !!n && !BOILERPLATE.has(n.type)
  })
}

/** main.then 중 보일러플레이트(greeting·fallback) 루트 id. 귀속 계산의 stopAt 재료. */
export function boilerplateRootIds(flow) {
  const main = (flow?.dialogs || []).find((d) => d?.id === 'main')
  if (!main) return []
  const byId = indexNodes(flow)
  return (main.then || []).filter((id) => BOILERPLATE.has(byId.get(id)?.type))
}

/** intent("예약하기") / input.text.includes('예약할래') 등에서 사람이 읽을 트리거를 뽑는다. */
export function triggerFromCondition(condition) {
  const c = String(condition || '').trim()
  if (!c) return ''
  const intent = c.match(/intents?\(\s*['"]([^'"]+)['"]/)
  if (intent) return intent[1]
  // ⚠ /entities?/ 는 'entities'·'entitie'만 잡는다 — 'entity'는 안 잡힌다.
  const entity = c.match(/entit(?:y|ies)\(\s*['"]([^'"]+)['"]/)
  if (entity) return entity[1]
  const text = c.match(/input\.text[^'"]*['"]([^'"]+)['"]/)
  if (text) return text[1]
  return ''
}

/** output 노드 config에서 첫 멘트 텍스트. */
function mentOf(node) {
  const items = node?.config?.items
  if (!Array.isArray(items)) return ''
  for (const it of items) {
    const texts = it?.text?.[0]?.texts
    if (Array.isArray(texts) && texts.length) return String(texts[0] || '').trim()
  }
  return ''
}

/** set/input 노드가 담는 변수명(항목명 대용). */
function collectOf(node) {
  const items = node?.config?.items
  if (!Array.isArray(items) || !items.length) return ''
  const key = String(items[0]?.key || '').trim()
  return key ? key.replace(/^(local|global|context)\./, '') : ''
}

/**
 * @param {object} flow dialog JSON
 * @param {{scenarioNames?: Record<string,string>}} [opts] 루트 id → 이름(있으면 우선)
 * @returns {Array<{name:string, trigger:string, collects:string[], result:string, branches:string[]}>}
 */
export function flowToScenarios(flow, { scenarioNames } = {}) {
  const main = (flow?.dialogs || []).find((d) => d?.id === 'main')
  if (!main) return []
  const byId = indexNodes(flow)

  const out = []
  for (const rootId of scenarioRootIds(flow)) {
    const root = byId.get(rootId)

    const reached = walk(rootId, byId)
    const collects = []
    const branches = []
    let result = ''
    for (const id of reached) {
      const n = byId.get(id)
      if (!n) continue
      if (n.type === 'set' || n.type === 'input') {
        const v = collectOf(n)
        if (v && !collects.includes(v)) collects.push(v)
      }
      // 2갈래 이상으로 갈리는 지점 — 자식들의 조건을 갈림길 설명으로 모은다.
      const kids = (n.then || []).filter((k) => byId.has(k))
      if (kids.length >= 2) {
        for (const k of kids) {
          const kid = byId.get(k)
          const cond = String(kid?.condition || '').trim()
          const label = String(kid?.label || '').trim() || nodeTypeInfo(kid?.type).label
          if (cond) branches.push(`${cond} → ${label}`)
        }
      }
      if (n.type === 'output') {
        const m = mentOf(n)
        if (m) result = m   // 마지막 멘트를 완료 결과로 본다
      }
    }

    const bundled = String(scenarioNames?.[rootId] || '').trim()
    const trigger = triggerFromCondition(root.condition)
    const name = bundled || trigger || String(root.label || '').trim() || rootId
    out.push({ name, trigger, collects, result, branches })
  }
  return out
}

/** rootId에서 도달 가능한 노드 id(방문 순서). 다른 시나리오 루트로는 넘어가지 않는다. */
export function walk(rootId, byId, stopAt = new Set()) {
  const seen = new Set()
  const order = []
  const stack = [rootId]
  while (stack.length) {
    const id = stack.shift()
    if (!id || seen.has(id) || !byId.has(id) || stopAt.has(id)) continue
    seen.add(id)
    order.push(id)
    const n = byId.get(id)
    for (const t of n?.then || []) stack.push(t)
    for (const b of n?.body || []) if (typeof b === 'string') stack.push(b)
  }
  return order
}

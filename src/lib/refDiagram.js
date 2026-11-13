// 시나리오 레퍼런스 flow_json → 다이어그램/사용자 흐름도 모델 파생.
// 파생 기준(greeting·fallback 제외, then-우선 DFS, __init 숨김)은 refShared.js가 refSummary.js와 함께 강제한다.

import { TYPE_KO, firstOutputText, getBoilerAndRoots } from './refShared.js'

// 분기 화살표에 붙일 조건 라벨. 조건이 없으면 대상 노드 라벨(선택지)로 폴백.
// input.text.includes('배송') 같은 흔한 표현은 따옴표 안 값만 뽑아 읽기 쉽게 한다.
export function conditionLabel(condition, fallback = '') {
  const c = String(condition || '').trim()
  if (!c) return String(fallback || '').trim()
  const negated = /==\s*false\b/.test(c) || /^!\s*/.test(c)  // 부정 표현
  const m = c.match(/includes\(\s*['"]([^'"]+)['"]\s*\)/)
  if (m) return negated ? `${m[1]} 아님` : m[1]
  return c
}

// then 대상을 따라가며 __init(수집/반복 스캐폴딩) 노드는 건너뛰고 실제 보이는 노드로 해소한다.
// 예: collectinit → collect__init(__init) → collect  ⇒  [collect]
// (엣지를 __init에서 끊지 않고 그 너머 실제 노드로 이어줘 노드가 떠 보이지 않게 함)
function resolveVisibleTargets(startId, byId, boiler) {
  const out = []
  const seen = new Set()
  const stack = [startId]
  while (stack.length) {
    const id = stack.pop()
    if (!id || seen.has(id) || !byId.has(id) || boiler.has(id)) continue
    seen.add(id)
    if (String(id).endsWith('__init')) {
      for (const t of (byId.get(id).then || [])) stack.push(t)
    } else {
      out.push(id)
    }
  }
  return out
}

// 시나리오 진입 조건 — deriveUserFlow와 같은 기준(condition 우선, 없으면 config.condition).
function entryConditionOf(node) {
  return String(node?.condition ?? node?.config?.condition ?? '').trim()
}

// 시나리오 표시 이름 3단 폴백 — ① 결과 번들(generation_tiers.scenarios) ② 진입 조건 파생 ③ 루트 라벨.
// 구조 다이어그램과 사용자 흐름도가 같은 시나리오를 다르게 부르지 않도록 두 파생 함수가 공유한다.
// ②가 있어서 번들이 없는 기존 결과도 서술문 라벨 대신 짧은 이름을 얻는다.
function resolveScenarioName(rootNode, scenarioNames, title) {
  const bundled = String(scenarioNames?.[rootNode?.id] || '').trim()
  return bundled || conditionLabel(entryConditionOf(rootNode)) || title
}

// 반환: { scenarios: [{rootId, title, name, nodeIds}], nodes: [{id, label, type, kindKo, scenarioRootId, entryCondition}], edges: [{from, to}], loops: [{id, bodyIds, exitCondition, maxCount}] }
export function deriveStructure(flowJson, { scenarioNames } = {}) {
  const main = (flowJson?.dialogs || []).find(d => d?.id === 'main')
  if (!main) return { scenarios: [], nodes: [], edges: [], loops: [] }

  const byId = new Map((main.nodes || []).map(n => [n.id, n]))
  const { boiler, roots } = getBoilerAndRoots(byId, main.then || [])

  const scenarios = []
  const nodesOut = []
  const edgesOut = []
  const loopsOut = []
  const globalSeen = new Set()
  const edgeSeen = new Set()

  function addNode(n, rootId) {
    if (globalSeen.has(n.id)) return
    globalSeen.add(n.id)
    nodesOut.push({
      id: n.id,
      label: String(n.label || '').trim() || TYPE_KO[n.type] || n.type,
      type: n.type,
      kindKo: TYPE_KO[n.type] || n.type,
      scenarioRootId: rootId,
      // 시나리오 루트는 들어오는 엣지가 없어 조건이 실릴 자리가 없다 → 노드가 직접 들고 있는다.
      entryCondition: n.id === rootId ? entryConditionOf(n) : '',
    })
  }

  function addEdge(from, to) {
    const key = `${from}→${to}`
    if (edgeSeen.has(key)) return
    edgeSeen.add(key)
    // 엣지에 대상 노드의 진입 조건·라벨을 실어 분기 화살표 라벨로 쓴다.
    const tn = byId.get(to)
    edgesOut.push({
      from,
      to,
      condition: String(tn?.condition || '').trim(),
      label: String(tn?.label || '').trim(),
    })
  }

  for (const rootId of roots) {
    if (!byId.has(rootId)) continue
    const nodeIds = []

    // BFS through then connections — __init 노드는 탐색은 하되 visible 노드·엣지에서 제외
    const mainQ = [rootId]
    const mainSeen = new Set()
    while (mainQ.length) {
      const id = mainQ.shift()
      if (!id || mainSeen.has(id) || boiler.has(id) || !byId.has(id)) continue
      mainSeen.add(id)
      const n = byId.get(id)

      // then 전체를 큐에 push(탐색용) — __init도 포함해 transitive 연결 유지
      for (const t of (n.then || [])) mainQ.push(t)

      // __init 노드는 visible 노드·엣지에 포함하지 않음
      if (String(id).endsWith('__init')) continue

      nodeIds.push(id)
      addNode(n, rootId)

      // 엣지: then 대상을 실제 보이는 노드로 해소(__init 스캐폴딩은 건너뛰어 이어줌)
      for (const t of (n.then || [])) {
        for (const vt of resolveVisibleTargets(t, byId, boiler)) addEdge(id, vt)
      }
    }

    // subflow body 노드 수집 — 루프 구조로 분리
    for (const id of [...nodeIds]) {
      const n = byId.get(id)
      if (!n || n.type !== 'subflow') continue

      const bodyIds = []
      const bodyQ = [...(n.body || [])]
      const bodyVisited = new Set()
      while (bodyQ.length) {
        const bid = bodyQ.shift()
        if (!bid || bodyVisited.has(bid) || !byId.has(bid)) continue
        if (String(bid).endsWith('__init')) continue
        bodyVisited.add(bid)
        bodyIds.push(bid)
        if (!nodeIds.includes(bid)) nodeIds.push(bid)
        addNode(byId.get(bid), rootId)
        const bn = byId.get(bid)
        for (const bt of (bn.then || [])) bodyQ.push(bt)
        for (const bb of (bn.body || [])) bodyQ.push(bb)
      }

      // 본문 내부 엣지 — 양 끝이 모두 이 loop의 본문에 속하는 then만(박스 안에서 연결)
      const bodySet = new Set(bodyIds)
      const bodyEdges = []
      const bodyEdgeSeen = new Set()
      for (const bid of bodyIds) {
        for (const bt of (byId.get(bid)?.then || [])) {
          for (const vt of resolveVisibleTargets(bt, byId, boiler)) {
            if (!bodySet.has(vt)) continue
            const k = `${bid}→${vt}`
            if (bodyEdgeSeen.has(k)) continue
            bodyEdgeSeen.add(k)
            const tvn = byId.get(vt)
            bodyEdges.push({
              from: bid,
              to: vt,
              condition: String(tvn?.condition || '').trim(),
              label: String(tvn?.label || '').trim(),
            })
          }
        }
      }

      loopsOut.push({
        id,
        bodyIds,
        bodyEdges,
        exitCondition: n.config?.loop?.condition ?? null,
        maxCount: n.config?.loop?.count ?? null,
      })
    }

    const rootNode = byId.get(rootId)
    const title = String(rootNode.label || '').trim() || TYPE_KO[rootNode.type] || rootNode.type
    // 이름 3단 폴백: ① 번들 ② 진입 조건 파생 ③ 루트 라벨(title).
    // ②가 있어서 생성기 배포 전에도 기존 결과가 개선된다.
    const name = resolveScenarioName(rootNode, scenarioNames, title)
    scenarios.push({ rootId, title, name, nodeIds })
  }

  return { scenarios, nodes: nodesOut, edges: edgesOut, loops: loopsOut }
}

// 턴 교대 강제: 이 챗봇은 사용자 발화 ↔ 봇 응답 왕복이며 봇은 한 번에 두 답을 못 한다.
// 봇 스텝이 연달아 나오면(=두 번 답) 사이에 '사용자 응답 대기'(actor:'wait')를 끼워 넣는다.
function interleaveWaits(steps) {
  const out = []
  for (const s of steps) {
    const prev = out[out.length - 1]
    if (s.actor === 'bot' && prev && prev.actor === 'bot') out.push({ actor: 'wait' })
    out.push(s)
  }
  return out
}

// 반환: { scenarios: [{title, name, steps: [{actor: 'user'|'bot'|'wait', text?, choices?, repeat?, actions?}]}] }
export function deriveUserFlow(flowJson, { scenarioNames } = {}) {
  const main = (flowJson?.dialogs || []).find(d => d?.id === 'main')
  if (!main) return { scenarios: [] }

  const byId = new Map((main.nodes || []).map(n => [n.id, n]))
  const { boiler, roots } = getBoilerAndRoots(byId, main.then || [])

  const scenarios = []

  for (const rootId of roots) {
    if (!byId.has(rootId)) continue
    const rootNode = byId.get(rootId)
    const title = String(rootNode.label || '').trim() || TYPE_KO[rootNode.type] || rootNode.type
    const steps = []
    const pendingActions = []  // 내부 처리(api 조회·esd 기록 저장) — 다음 봇 응답에 주석으로 붙임

    // 시나리오 진입 트리거
    const entryCondition = rootNode.condition ?? rootNode.config?.condition
    if (entryCondition) {
      steps.push({ actor: 'user', text: String(entryCondition) })
    }

    // then 우선 DFS — refSummary와 같은 순회 기준
    const stack = [rootId]
    const visited = new Set()
    while (stack.length) {
      const id = stack.pop()
      if (!id || visited.has(id) || boiler.has(id) || !byId.has(id)) continue
      visited.add(id)
      const n = byId.get(id)

      // then 전체를 역순 push(탐색용) — __init 포함
      const allThens = (n.then || []).filter(t => t && byId.has(t) && !boiler.has(t))
      for (let i = allThens.length - 1; i >= 0; i--) stack.push(allThens[i])

      // __init: 탐색만 하고 스텝 미생성
      if (String(id).endsWith('__init')) continue

      // choices 계산용 visible thens
      const visibleThens = allThens.filter(t => !String(t).endsWith('__init'))

      if (n.type === 'output' || n.type === 'llmchat') {
        const raw = firstOutputText(n)
        // 전문 표시(자르지 않음) — 사용자 흐름도 목록에서 내용 전부 보이게
        const text = raw || (String(n.label || '').trim() || TYPE_KO[n.type])
        const step = { actor: 'bot', text }
        // 직전 내부 처리(조회·저장)는 별도 답변이 아니라 이 응답의 처리 주석으로 붙임
        if (pendingActions.length) { step.actions = pendingActions.slice(); pendingActions.length = 0 }
        if (visibleThens.length >= 2) {
          step.choices = visibleThens.map(t => {
            const tn = byId.get(t)
            return String(tn?.label || '').trim() || TYPE_KO[tn?.type] || tn?.type || t
          })
        }
        steps.push(step)
      } else if (n.type === 'input') {
        steps.push({ actor: 'user', text: String(n.label || '').trim() || TYPE_KO[n.type] })
      } else if (n.type === 'subflow') {
        // 검증 루프를 직전 user 스텝에 접음
        const lastStep = steps[steps.length - 1]
        if (lastStep && lastStep.actor === 'user') {
          lastStep.repeat = true
        } else {
          steps.push({ actor: 'user', text: '올바른 값일 때까지 재입력' })
        }
        // body 노드는 user flow에서 탐색하지 않음
      } else if (n.type === 'api') {
        pendingActions.push('조회')       // 내부 처리 — 봇 답변 아님(다음 응답에 주석)
      } else if (n.type === 'esd') {
        pendingActions.push('기록 저장')   // 내부 처리 — 봇 답변 아님
      }
      // set·condition·node: 숨김
    }

    // 뒤에 봇 응답이 없던 내부 처리는 마지막 봇 스텝에 붙이거나 단독 처리 스텝으로
    if (pendingActions.length) {
      const last = steps[steps.length - 1]
      if (last && last.actor === 'bot') last.actions = (last.actions || []).concat(pendingActions)
      else steps.push({ actor: 'bot', text: pendingActions.join(' · '), actionsOnly: true })
    }

    scenarios.push({ title, name: resolveScenarioName(rootNode, scenarioNames, title), steps: interleaveWaits(steps) })
  }

  return { scenarios }
}

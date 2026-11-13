// canvas 델타 → 머신트리 역반영 (순수).
// canvasToFlow(originalFlow, { nodes, edges }) → newFlow
// 원본 flow 기준 델타 적용(D1 결정): deriveStructure와 canvas 상태를 diff해 최소 변형만 적용.
// 순수: fetch/IO/Deno.env 없음. 입력 flow 불변(applyEditPatch가 deep clone).
import { deriveStructure } from '../refDiagram.js'
import { applyEditPatch } from '../edit/applyEditPatch.js'
import { materializeLoopBody } from './loopBody.js'

// __init 스캐폴딩을 건너뛰며 실제 보이는 노드 id 목록을 반환한다.
function resolveVisible(startId, byId) {
  const out = []
  const seen = new Set()
  const stack = [startId]
  while (stack.length) {
    const id = stack.pop()
    if (!id || seen.has(id) || !byId.has(id)) continue
    seen.add(id)
    if (String(id).endsWith('__init')) {
      for (const t of (byId.get(id).then || [])) stack.push(t)
    } else {
      out.push(id)
    }
  }
  return out
}

/**
 * canvas 상태(nodes, edges)를 원본 flow와 diff해 최소 변형으로 역반영한다.
 * @param {object} originalFlow - generated_json 머신 다이얼로그 트리
 * @param {{ nodes: object[], edges: object[] }} canvas
 *   - nodes: ReactFlow 노드 배열. id 필수. 타입은 n.data?.type || n.type.
 *   - edges: ReactFlow 엣지 배열. source·target 필수.
 * @returns {object} 새 flow (originalFlow 불변)
 */
export function canvasToFlow(originalFlow, { nodes, edges }) {
  if (!originalFlow) return originalFlow

  // 0. 시각 전용 래퍼 제외 — 시나리오 그룹 박스(type 'scenarioGroup', id '_g_<rootId>')는 실제 노드가 아니다.
  //    제외하지 않으면 canvasToFlow가 이를 '추가된 노드'로 오인해 dialog.then·nodes에 주입(flow 오염)한다.
  //    (loopGroup은 실제 subflow id를 쓰므로 제외하면 안 된다 — 여기선 scenarioGroup만.)
  const contentNodes = (nodes || []).filter(
    (n) => n && n.type !== 'scenarioGroup' && !String(n.id).startsWith('_g_'),
  )

  // 1. 참조 구조 파생
  const derived = deriveStructure(originalFlow)
  const derivedNodeIds = new Set(derived.nodes.map(n => n.id))
  const canvasNodeIds = new Set(contentNodes.map(n => n.id))

  // 반복 본문 노드는 top-level 캔버스 diff 대상이 아니다 — 편집 모드에선 박스 안에 렌더되지 않고
  // 반복 편집기(subflow data.body)가 관리한다. 여기서 제외해 '캔버스에 없다 → 삭제' 오판을 막고,
  // 본문 변경은 아래 materialize 패스(data.body)로만 반영한다.
  const bodyIdsByLoop = new Map((derived.loops || []).map(l => [l.id, new Set(l.bodyIds || [])]))
  const allBodyIds = new Set()
  for (const s of bodyIdsByLoop.values()) for (const id of s) allBodyIds.add(id)

  // 2. 노드 델타
  const removedNodeIds = [...derivedNodeIds].filter(id => !canvasNodeIds.has(id) && !allBodyIds.has(id))
  const addedNodes = contentNodes.filter(n => !derivedNodeIds.has(n.id))

  // 3. 패치 ops 구성 (노드 추가/삭제)
  const patch = []
  for (const id of removedNodeIds) {
    patch.push({ op: 'remove_node', nodeId: id })
  }
  for (const n of addedNodes) {
    patch.push({
      op: 'add_node',
      dialogId: 'main',
      node: {
        id: n.id,
        type: n.data?.type || n.type || 'output',
        label: n.data?.label || '',
        then: [],
      },
    })
  }

  // applyEditPatch: deep clone + remove_node 재연결 + add_node 풀 추가
  const { flow } = applyEditPatch(originalFlow, patch)

  const mainDialog = (flow.dialogs || []).find(d => d.id === 'main')
  if (!mainDialog) return flow

  // add_node는 parentId 없으면 dialog.then에 추가하는데,
  // 진입 엣지가 있는 중간 노드는 dialog.then에서 제거한다.
  if (addedNodes.length > 0) {
    const addedIds = new Set(addedNodes.map(n => n.id))
    const hasIncoming = new Set()
    for (const e of edges) {
      if (addedIds.has(e.target)) hasIncoming.add(e.target)
    }
    mainDialog.then = mainDialog.then.filter(id => !addedIds.has(id) || !hasIncoming.has(id))
  }

  const byId = new Map((mainDialog.nodes || []).map(n => [n.id, n]))

  // 4. 엣지 맵 구성
  // canvas: source → Set<target>
  const canvasOutMap = new Map()
  for (const e of edges) {
    if (!canvasOutMap.has(e.source)) canvasOutMap.set(e.source, new Set())
    canvasOutMap.get(e.source).add(e.target)
  }

  // derived: from → Set<to> (가시 노드 간 직접 엣지)
  const derivedOutMap = new Map()
  for (const e of derived.edges) {
    if (!derivedOutMap.has(e.from)) derivedOutMap.set(e.from, new Set())
    derivedOutMap.get(e.from).add(e.to)
  }

  // 5. 엣지 변경 처리
  const removedSet = new Set(removedNodeIds)
  const allSources = new Set([...derivedOutMap.keys(), ...canvasOutMap.keys()])

  for (const srcId of allSources) {
    if (removedSet.has(srcId)) continue
    if (!byId.has(srcId)) continue

    const derivedTargets = derivedOutMap.get(srcId) || new Set()
    const canvasTargets = canvasOutMap.get(srcId) || new Set()

    // 삭제된 노드로의 연결은 remove_node가 이미 재연결 처리 → 비교에서 제외
    const effectiveDerived = new Set([...derivedTargets].filter(t => !removedSet.has(t)))
    const unchanged =
      effectiveDerived.size === canvasTargets.size &&
      [...effectiveDerived].every(t => canvasTargets.has(t))
    if (unchanged) continue

    const node = byId.get(srcId)
    const currentThen = [...(node.then || [])]
    const newThen = []
    const covered = new Set()

    // 기존 then 엔트리 중 canvas 대상으로 해소되는 것만 보존 (__init 브리지 유지)
    for (const thenEntry of currentThen) {
      const resolved = resolveVisible(thenEntry, byId)
      if (resolved.some(t => canvasTargets.has(t))) {
        newThen.push(thenEntry)
        for (const t of resolved) covered.add(t)
      }
    }

    // 새로 추가된 canvas 대상은 직접 참조로 추가
    for (const tgt of canvasTargets) {
      if (!covered.has(tgt)) newThen.push(tgt)
    }

    node.then = newThen
  }

  // 6. 엣지 조건 반영 — 사용자가 편집한 캔버스 엣지 data.condition을 타겟 노드의 condition에 기록.
  //    엣지 A→B 조건은 타겟 B의 진입 조건(refDiagram와 동일 모델). data.condition 없는 엣지는
  //    건드리지 않아 원본 조건을 보존한다(하위호환). label은 conditionLabel로 자동 파생이라 미변경.
  for (const e of edges) {
    if (!e || e.data == null || e.data.condition === undefined) continue
    const tgt = byId.get(e.target)
    if (!tgt) continue                       // main dialog 밖(루프/서브다이얼로그) 타겟은 MVP 제외
    const cond = String(e.data.condition || '').trim()
    if (cond) tgt.condition = cond
    else delete tgt.condition
  }

  // 7. 노드 내용(label/config) 실어나르기 — 캔버스 노드 data를 flow에 반영.
  //    노드 내용도 엣지 조건과 마찬가지로 캔버스가 source of truth여야 재계산(추가/삭제/연결)에도
  //    편집·신규 내용이 보존된다(안 하면 매번 원본에서 복제돼 유실). scenarioGroup(_g_)은
  //    contentNodes에서 이미 제외. 미편집 노드는 data가 원본과 동일해 멱등(no-op)이다.
  //    - structureNode: data가 곧 머신 노드라 data.config가 늘 존재(편집 전엔 원본과 동일).
  //    - loopGroup(반복 박스): data는 {label,maxCount,…}라 config 없음 → 편집 시에만 editor가 주입.
  //    ⚠ label은 '파생 표시 라벨과 다를 때만' 쓴다. deriveStructure는 label이 빈 노드에
  //    타입 기본값(예: set→"저장", output→"안내")을 채워 캔버스에 보내는데, 그걸 그대로
  //    되쓰면 **원본의 빈 label이 임의 값으로 오염된다**. 생성기 생성 봇은 label이 늘 차 있어
  //    드러나지 않았지만, 업로드한 실제 솔루션 봇에는 빈 label이 흔하다(2026-08-28 실측).
  //    사용자가 라벨을 파생값과 똑같이 입력한 경우만 저장이 생략되는데, 화면 표시가 동일하므로
  //    보이는 손실은 없다.
  const derivedLabelById = new Map((derived.nodes || []).map((n) => [n.id, n.label]))
  for (const cn of contentNodes) {
    const fn = byId.get(cn.id)
    if (!fn) continue
    const d = cn.data || {}
    if (typeof d.label === 'string' && d.label !== derivedLabelById.get(cn.id)) fn.label = d.label
    if (d.config !== undefined) fn.config = d.config
  }

  // 8. 반복 본문 materialize — subflow 캔버스 노드에 data.body(스텝 리스트)가 있으면
  //    subflow.body + 본문 노드 + then 체인으로 반영한다. data.body 미정의(미편집) 루프는
  //    원본 본문을 그대로 보존(위에서 body 노드를 삭제 diff에서 제외했으므로 유실 없음).
  for (const cn of contentNodes) {
    const fn = byId.get(cn.id)
    if (!fn || fn.type !== 'subflow') continue
    const steps = cn.data?.body
    if (steps === undefined) continue
    materializeLoopBody(mainDialog, cn.id, steps, bodyIdsByLoop.get(cn.id) || new Set())
  }

  return flow
}

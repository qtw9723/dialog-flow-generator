// 반복(subflow) 본문 관리 순수 헬퍼 (UI 무의존).
// 반복은 리프 노드가 아니라 컨테이너다: subflow.body=[진입 노드], 본문 노드들은 then 체인으로 이어진다.
// 편집기(NodeEditor)가 본문을 '순서대로 반복하는 스텝 리스트'로 관리하고, canvasToFlow가 이를
// 머신 트리(subflow.body + 본문 노드 + then 체인)로 materialize한다(= 본문의 source of truth는 리스트).
//
// v1 한계: 본문은 선형(첫 then 체인)으로 모델링한다. 본문 내부 분기(여러 갈래)는 첫 갈래만 읽는다.

// 본문 스텝으로 쓸 수 있는 타입(중첩 반복 금지 — subflow 제외).
export const BODY_STEP_TYPES = ['output', 'input', 'set', 'esd', 'api', 'node', 'llmchat']

// 새 본문 스텝 id — 루프 소유임이 드러나게 네임스페이스.
export const bodyStepId = (loopId, seq) => `${loopId}__b${seq}`

// __init 스캐폴딩을 건너뛰어 실제 노드 id로 해소.
function resolveVisible(id, byId) {
  let cur = id
  const guard = new Set()
  while (cur && byId.has(cur) && String(cur).endsWith('__init') && !guard.has(cur)) {
    guard.add(cur)
    cur = (byId.get(cur).then || [])[0]
  }
  return cur
}

/**
 * flow에서 loopId(subflow)의 본문 스텝을 순서대로 읽는다.
 * @returns {Array<{id:string,type:string,label:string,config:object}>}
 */
export function readLoopBody(flow, loopId) {
  const main = (flow?.dialogs || []).find((d) => d.id === 'main')
  if (!main) return []
  const byId = new Map((main.nodes || []).map((n) => [n.id, n]))
  const sd = byId.get(loopId)
  if (!sd || sd.type !== 'subflow') return []
  const out = []
  const seen = new Set()
  let cur = resolveVisible((sd.body || [])[0], byId)
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    const n = byId.get(cur)
    out.push({ id: n.id, type: n.type, label: String(n.label || ''), config: n.config || {} })
    cur = resolveVisible((n.then || [])[0], byId)
  }
  return out
}

/**
 * loopId의 본문을 steps 리스트로 재구성한다(mainDialog를 in-place 변형).
 * - oldBodyIds 중 새 리스트에 없는 노드는 제거
 * - steps를 upsert하고 then 체인으로 연결(마지막 스텝 then=[])
 * - subflow.body = [첫 스텝] (없으면 [])
 * @param {object} mainDialog - flow.dialogs 의 main 다이얼로그(변형됨)
 * @param {string} loopId
 * @param {Array<{id,type,label,config}>} steps
 * @param {Set<string>} oldBodyIds - 원본에서 이 루프가 소유하던 본문 노드 id
 */
export function materializeLoopBody(mainDialog, loopId, steps, oldBodyIds) {
  if (!mainDialog) return
  const byId = new Map((mainDialog.nodes || []).map((n) => [n.id, n]))
  const sd = byId.get(loopId)
  if (!sd) return
  const list = Array.isArray(steps) ? steps : []
  const newIds = new Set(list.map((s) => s.id))

  // 이 루프가 소유하던 옛 본문 노드 중 재사용 안 되는 것 제거
  mainDialog.nodes = (mainDialog.nodes || []).filter((n) => !(oldBodyIds.has(n.id) && !newIds.has(n.id)))
  const alive = new Map(mainDialog.nodes.map((n) => [n.id, n]))

  // upsert + then 체인
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    const nextThen = i < list.length - 1 ? [list[i + 1].id] : []
    const existing = alive.get(s.id)
    if (existing) {
      existing.type = s.type
      existing.label = s.label
      existing.config = s.config
      existing.then = nextThen
    } else {
      mainDialog.nodes.push({ id: s.id, type: s.type, label: s.label, config: s.config, then: nextThen })
    }
  }

  sd.body = list.length ? [list[0].id] : []
}

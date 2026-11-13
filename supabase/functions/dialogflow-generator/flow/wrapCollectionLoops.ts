// 반복 수집(목록 모으기) 루프 결정론적 래핑.
// "여러 개 입력=예"로 표시된 수집 항목은 LLM이 단일 output(요청)→set(저장)만 설계하고,
// 여기서 그 쌍을 수집 루프로 감싼다 — LLM 편차가 큰 부분(누적·종료 분기·flag 조작)을 코드로 결정론화.
//
// 만드는 구조(materialized JSON):
//   init(set: exitVar=false, X=[]) → loop(subflow, body=[ask], cond=exitVar)
//     ask(output 요청) → [stop, acc]
//       stop(set exitVar=true, cond "input.text.includes('그만')")
//       acc(set X = X.concat([input.text]), cond "input.text.includes('그만') == false")
//   loop.then = 원래 set.then(continuation)

import { DEFAULT_LOOP_BEHAVIOR, exitCondition, LoopBehavior } from "./loopBehavior.ts"

// 종료 발화(기본). 봇 안내문도 이 단어로 맞춘다.
const STOP_PHRASE = "그만"

function normId(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
}

// 시나리오 응답에서 '여러 개 입력'=예 인 수집 항목의 식별자(변수명 우선·항목명 폴백) 집합.
export function buildRepeatVarSet(responses: Record<string, any>): Set<string> {
  const set = new Set<string>()
  for (const v of Object.values(responses || {})) {
    if (!Array.isArray(v) || v.length === 0 || typeof v[0] !== "object") continue
    for (const scenario of v) {
      const items = scenario?.["수집 정보"]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const repeat = String(item?.["여러 개 입력"] || "").trim()
        if (repeat !== "예") continue
        const id = String(item?.["변수명"] || "").trim() || String(item?.["항목명"] || "").trim()
        if (id) set.add(normId(id))
      }
    }
  }
  return set
}

function inputTextKey(setNode: any): string | null {
  const items = setNode?.config?.items
  if (!Array.isArray(items)) return null
  for (const it of items) {
    if (it && it.value === "input.text" && typeof it.key === "string" && it.key.trim()) return it.key.trim()
  }
  return null
}

// 안내문에 "다 하셨으면 '그만'이라고 해주세요"가 없으면 첫 텍스트 뒤에 덧붙인다(멱등).
function ensureStopHint(outputNode: any): void {
  const items = outputNode?.config?.items
  if (!Array.isArray(items)) return
  for (const it of items) {
    if (!it || it.type !== "text" || !Array.isArray(it.text) || it.text.length === 0) continue
    const t0 = it.text[0]
    const cur = Array.isArray(t0?.texts) ? String(t0.texts[0] || "") : ""
    if (cur.includes(STOP_PHRASE)) return
    t0.texts = [`${cur} 다 말씀하셨으면 '${STOP_PHRASE}'이라고 해주세요.`.trim()]
    return
  }
}

// 단순 boolean flag 조건식에서 변수명 추출("context.done" / "context.done == true" → "context.done").
// 복잡한 조건(함수·논리연산 등)이면 null(손대지 않음).
function parseExitVar(cond: unknown): string | null {
  if (typeof cond !== "string") return null
  const m = cond.trim().match(/^([A-Za-z_$][\w.$]*)\s*(?:==\s*true)?$/)
  return m ? m[1] : null
}

// 본문 멤버(루트에서 then으로 도달, continuation 진입 제외) id 집합.
function bodyMembers(L: any, byId: Map<string, any>): Set<string> {
  const cont = new Set<string>(Array.isArray(L.then) ? L.then : [])
  const members = new Set<string>()
  const queue = [...(L.body || [])]
  while (queue.length) {
    const id = queue.shift()!
    if (members.has(id) || cont.has(id) || !byId.has(id)) continue
    members.add(id)
    for (const nx of (byId.get(id)!.then || [])) if (!cont.has(nx)) queue.push(nx)
  }
  return members
}

// 누적 노드(save 재사용)와 종료 분기 노드를 만든다. askOutput.then = [stop, acc].
function makeAccumulateAndStop(askOutput: any, saveNode: any, key: string, exitVar: string): any {
  saveNode.config = { items: [{ key, value: `${key}.concat([input.text])`, condition: "" }] }
  saveNode.condition = `input.text.includes('${STOP_PHRASE}') == false`
  saveNode.then = []
  const stopNode = {
    id: `${saveNode.id}__stop`, type: "set", label: "수집 종료 처리",
    condition: `input.text.includes('${STOP_PHRASE}')`,
    config: { items: [{ key: exitVar, value: "true", condition: "" }] },
    then: [], actions: [],
  }
  ensureStopHint(askOutput)
  askOutput.then = [stopNode.id, saveNode.id]
  return stopNode
}

export function wrapCollectionLoops(
  generatedJson: any,
  repeatVars: Set<string>,
  behavior: LoopBehavior = DEFAULT_LOOP_BEHAVIOR,
): { wrapped: number } {
  const main = (generatedJson?.dialogs || []).find((d: any) => d?.id === "main")
  if (!main || !Array.isArray(main.nodes)) return { wrapped: 0 }
  if (!repeatVars || repeatVars.size === 0) return { wrapped: 0 }
  const nodes: any[] = main.nodes

  let wrapped = 0
  const setNodes = nodes.filter((n) => n.type === "set" && inputTextKey(n))
  for (const setNode of setNodes) {
    const key = inputTextKey(setNode)
    if (!key) continue
    const seg = key.split(".").pop() || key
    if (!repeatVars.has(normId(seg))) continue

    // 직전 요청 output: then이 정확히 [set.id]인 output 1개여야 한다(본문 모호 방지)
    const askOutput = nodes.find((n) => n.type === "output" && Array.isArray(n.then) && n.then.length === 1 && n.then[0] === setNode.id)
    if (!askOutput) continue

    const byId = new Map(nodes.map((n) => [n.id, n]))
    // LLM이 이미 루프로 감쌌으면(askOutput이 어떤 subflow body 멤버) 그 루프를 제자리 정규화.
    const enclosing = nodes.find((n) => n.type === "subflow" && Array.isArray(n.body) && bodyMembers(n, byId).has(askOutput.id))

    if (enclosing) {
      const exitVar = parseExitVar(enclosing.config?.loop?.condition)
      if (!exitVar) continue                                   // 복잡 조건 루프는 손대지 않음
      const stopNode = makeAccumulateAndStop(askOutput, setNode, key, exitVar)
      // 종료 노드를 본문에 둔다(루프 부모와 무관, 트리 잎). 배열 [] init은 initLoopAccumulators이 처리.
      nodes.push(stopNode)
      // 루프 조건을 behavior 규약에 맞춤(LLM이 truthy로 뒀어도 일관).
      enclosing.config.loop.condition = exitCondition(exitVar, behavior)
      wrapped++
      continue
    }

    // 루프가 없으면(규칙대로 output→set만) 새 수집 루프를 만든다.
    const continuation = Array.isArray(setNode.then) ? [...setNode.then] : []
    const exitVar = `context.${seg}Done`
    const stopNode = makeAccumulateAndStop(askOutput, setNode, key, exitVar)
    const loop = {
      id: `${setNode.id}__collect`, type: "subflow", label: `${askOutput.label || "입력"} 반복 수집`,
      condition: "",
      config: { loop: { condition: exitCondition(exitVar, behavior), count: String(behavior.defaultMax) } },
      body: [askOutput.id], then: continuation, actions: [],
    }
    const init = {
      id: `${setNode.id}__collectinit`, type: "set", label: "수집 초기화", condition: "",
      config: { items: [{ key: exitVar, value: "false", condition: "" }, { key, value: "[]", condition: "" }] },
      then: [loop.id], actions: [],
    }
    // 재배선: askOutput.id를 가리키던 모든 then/body 참조 + dialog.then 루트를 init으로 교체
    for (const n of nodes) {
      if (Array.isArray(n.then)) n.then = n.then.map((t: string) => (t === askOutput.id ? init.id : t))
      if (Array.isArray(n.body)) n.body = n.body.map((t: string) => (t === askOutput.id ? init.id : t))
    }
    if (Array.isArray(main.then)) main.then = main.then.map((t: string) => (t === askOutput.id ? init.id : t))
    nodes.push(stopNode, loop, init)
    wrapped++
  }

  return { wrapped }
}

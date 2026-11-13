// 루프 탈출 변수 정합화(결정론적 안전장치). LLM이 루프 본문의 '탈출 flag' set 노드 key를
// 루프의 exitVar와 다른 변수로 채우면(예: local.doneFlag vs context.done) 런타임에 탈출 조건이
// 영원히 falsy로 남아 루프가 안 빠진다. materialized(값 채움 끝난) 노드 위에서, 본문의
// boolean flag set(value가 'true'/'false')의 key를 루프 exitVar로 맞춘다.
//
// flag-loop subflow(condition이 bare 변수 또는 'var == true')에만 적용한다. 검증 재시도 루프
// (wrapValidationLoops가 만드는 condition에 .match(...) 등 식이 든 subflow)는 건드리지 않는다.
// 이 정합화는 fillNodeValues 직후·wrapValidationLoops 이전에 돈다.

const BOOL_VALUES = new Set(["true", "false"])

// condition에서 exitVar를 추출. 'var', 'var == true' 형태만 변수로 인정(식·함수호출·정규식 제외).
export function parseExitVar(condition: unknown): string | null {
  if (typeof condition !== "string") return null
  const v = condition.trim().replace(/\s*==\s*true\s*$/, "").trim()
  if (!/^[A-Za-z_$][\w$.]*$/.test(v)) return null
  return v
}

// body 루트들로부터 then/body를 따라 도달하는 set 노드 수집(본문 내부 한정).
export function bodyReachableSets(nodes: any[], bodyRoots: string[]): any[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const queue = [...bodyRoots]
  const sets: any[] = []
  while (queue.length) {
    const id = queue.shift()
    if (id == null || seen.has(id)) continue
    seen.add(id)
    const n = byId.get(id)
    if (!n) continue
    if (n.type === "set") sets.push(n)
    for (const nx of (n.then || [])) queue.push(nx)
    for (const b of (n.body || [])) queue.push(b)
  }
  return sets
}

export function normalizeLoopExitVars(json: any): { normalized: number } {
  let normalized = 0
  for (const d of (json?.dialogs || [])) {
    const nodes: any[] = d?.nodes || []
    for (const node of nodes) {
      if (node?.type !== "subflow") continue
      const exitVar = parseExitVar(node?.config?.loop?.condition)
      if (!exitVar) continue   // 검증 루프 등 식 조건은 스킵
      const bodyRoots = Array.isArray(node.body) ? node.body : []
      const sets = bodyReachableSets(nodes, bodyRoots)
      // 이미 본문에서 exitVar를 set하는 노드가 있으면 정합 — 그대로 둔다.
      const writesExit = sets.some((s) => (s.config?.items || []).some((it: any) => it?.key === exitVar))
      if (writesExit) continue
      // 본문의 boolean flag set(value가 'true'/'false')의 key를 exitVar로 맞춘다.
      // 데이터 저장 set(value가 input.text 등)은 boolean이 아니므로 건드리지 않는다.
      for (const s of sets) {
        for (const it of (s.config?.items || [])) {
          if (it && BOOL_VALUES.has(String(it.value).trim()) && it.key !== exitVar) {
            it.key = exitVar
            normalized++
          }
        }
      }
    }
  }
  return { normalized }
}

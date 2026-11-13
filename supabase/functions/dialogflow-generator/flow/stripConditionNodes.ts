// 무의미한 컨디션 노드 제거(결정론적 안전장치). 규칙(solution_rules)이 생성을 1차로 막지만,
// LLM 프롬프트 규칙은 best-effort라 가끔 빈 컨디션 노드가 남는다 → 결과 저장 전 파이프라인 안에서 splice.
// (생성-후-삭제가 아니라 materialize된 in-memory JSON을 정리하는 것이라 리소스 누수 없음.)
//
// 컨디션 노드(type "node")의 정당한 용도는 (1) 시나리오 진입 트리거(루트), (2) 분기(자식 ≥2)뿐이다.
// 따라서 "비루트 + 자식 ≤1 + condition 비어있음"인 node는 아무 일도 안 하는 잉여 → 제거하고
// 부모의 참조를 그 노드의 자식으로 잇는다(splice). 분기 노드(자식 ≥2)와 진입 루트, 조건이 채워진
// 가드 노드는 건드리지 않는다(보수적).
function isBlank(s: unknown): boolean {
  return typeof s !== "string" || s.trim() === ""
}

export function stripMeaninglessConditionNodes(generatedJson: any): { removed: number } {
  const dialogs = generatedJson?.dialogs
  if (!Array.isArray(dialogs)) return { removed: 0 }
  let removed = 0

  for (const dialog of dialogs) {
    const nodes: any[] = Array.isArray(dialog?.nodes) ? dialog.nodes : []
    if (nodes.length === 0) continue
    const roots = new Set<string>(Array.isArray(dialog.then) ? dialog.then : [])

    // 반복: 한 번 splice가 다른 노드를 잎으로 만들 수 있어 변화 없을 때까지 수렴.
    let changed = true
    while (changed) {
      changed = false
      const victim = nodes.find((n) =>
        n?.type === "node" &&
        !roots.has(n.id) &&
        (Array.isArray(n.then) ? n.then.length <= 1 : true) &&
        isBlank(n.condition)
      )
      if (!victim) break

      const childThen: string[] = Array.isArray(victim.then) ? victim.then : []
      // 부모(then/body로 victim을 가리키는 노드)의 참조를 victim의 자식으로 교체(splice).
      const rewire = (arr: string[] | undefined): string[] | undefined => {
        if (!Array.isArray(arr) || !arr.includes(victim.id)) return arr
        const out: string[] = []
        for (const t of arr) {
          if (t === victim.id) { for (const c of childThen) if (!out.includes(c)) out.push(c) }
          else if (!out.includes(t)) out.push(t)
        }
        return out
      }
      for (const m of nodes) {
        m.then = rewire(m.then)
        if (Array.isArray(m.body)) m.body = rewire(m.body)
      }
      if (Array.isArray(dialog.then)) dialog.then = rewire(dialog.then)

      const idx = nodes.findIndex((n) => n.id === victim.id)
      if (idx >= 0) nodes.splice(idx, 1)
      removed++
      changed = true
    }
  }

  return { removed }
}

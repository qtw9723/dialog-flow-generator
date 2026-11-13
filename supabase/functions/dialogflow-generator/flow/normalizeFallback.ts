// fallback 1회성 보장(결정론적 안전장치). fallback는 greeting처럼 다이얼로그당 한 번만
// 존재하는 catch-all 타입이다(레퍼런스 전례: main 루트 마지막 1개). 보일러플레이트는
// expandWithSpecs가 항상 id "fallback"로 추가하므로, designFlow(LLM)이 플로우 중간에 설계한
// fallback는 전부 비정상 → 자식이 있으면 컨디션 노드(node)로 전환해 "다른 노드의 조건 처리"로
// 해결하고, 자식이 없으면 제거한다(매칭 안 된 입력은 루트 fallback가 받는다).
const BOILERPLATE_ID = "fallback"

export function normalizeFallback(generatedJson: any): { converted: number; removed: number } {
  const out = { converted: 0, removed: 0 }
  const dialogs = generatedJson?.dialogs
  if (!Array.isArray(dialogs)) return out

  for (const dialog of dialogs) {
    const nodes: any[] = Array.isArray(dialog?.nodes) ? dialog.nodes : []
    for (const n of [...nodes]) {
      if (n?.type !== "fallback" || n.id === BOILERPLATE_ID) continue
      const hasChildren = Array.isArray(n.then) && n.then.length > 0
      if (hasChildren) {
        // else 분기로 쓰였음 → 분기 컨디션 노드로 전환(자식·조건 유지, 조건 없으면 catch-all)
        n.type = "node"
        n.config = { ...(n.config || {}), auth: false }
        if (typeof n.condition !== "string" || n.condition.trim() === "") n.condition = "true"
        out.converted++
      } else {
        // 아무 일도 안 하는 중간 fallback → 제거 + 모든 참조 해제
        const drop = (arr: string[] | undefined) =>
          Array.isArray(arr) ? arr.filter((id) => id !== n.id) : arr
        for (const m of nodes) {
          m.then = drop(m.then)
          if (Array.isArray(m.body)) m.body = drop(m.body)
        }
        dialog.then = drop(dialog.then)
        nodes.splice(nodes.findIndex((x) => x.id === n.id), 1)
        out.removed++
      }
    }
  }
  return out
}

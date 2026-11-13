// 이어지는 멘트 합치기 (순수, 결정론적 안전장치) — 2026-10-26 솔루션 확인.
//
// 런타임은 output이 나가면 그 턴을 끝내고, 다음 입력이 오면 그 output 아래부터 탐색한다.
// 그래서 "안내 → (조건 없는) 안내"처럼 멘트가 바로 이어지면 사용자가 한 번 더 말해야 뒤 멘트가 나온다.
// (확인: 인사 → [1] → [2] → 입력 저장 봇을 솔루션에서 돌리면 [1]만 나오고 입력 뒤에 [2]가 나왔다.)
// 사용자 입력을 기다릴 이유가 없는 연속 멘트는 앞 멘트의 items 뒤에 붙여 한 output으로 만든다.
//
// 합치지 않는 경우 — 그 경계가 의도된 입력 대기일 수 있다:
//   - 뒤 멘트에 조건이 있다(사용자 입력에 대한 응답) / 갈래가 둘 이상이다(분기)
//   - 앞 멘트에 글자 외 항목(버튼 등)이 있다 — 버튼 입력을 기다리는 것이다
//   - 앞 멘트가 waitInput:true다
//   - 뒤 멘트가 다른 곳(루트·다른 then·body)에서도 참조된다 / 뒤 멘트에 body가 있다

const condOf = (n) => String(n?.condition ?? n?.config?.condition ?? '').trim()
const isTextOnly = (n) => (n?.config?.items || []).every((it) => it?.type === 'text')

/**
 * @param {object} flow - 머신 다이얼로그 트리
 * @returns {{flow: object, merged: Array<{nodeId: string, mergedId: string}>}}
 *          flow: 합친 사본(합칠 게 없으면 입력 그대로). merged: 앞 멘트 id ← 합쳐져 사라진 멘트 id.
 */
export function mergeConsecutiveOutputs(flow) {
  const dialogs = flow?.dialogs
  if (!Array.isArray(dialogs)) return { flow, merged: [] }

  const merged = []
  const newDialogs = dialogs.map((d) => {
    if (!Array.isArray(d?.nodes)) return d
    let nodes = d.nodes
    let changed = false
    // 연쇄(a→b→c)를 한 번에 접기 위해 더 합칠 게 없을 때까지 반복한다.
    for (;;) {
      const refs = new Map()
      const count = (id) => refs.set(id, (refs.get(id) || 0) + 1)
      for (const id of (d.then || [])) count(id)
      for (const n of nodes) {
        for (const id of (n?.then || [])) count(id)
        for (const id of (n?.body || [])) count(id)
      }
      const byId = new Map(nodes.map((n) => [n?.id, n]))

      const pair = nodes.map((p) => {
        if (p?.type !== 'output' || p.config?.waitInput === true || !isTextOnly(p)) return null
        if (!Array.isArray(p.then) || p.then.length !== 1) return null
        const c = byId.get(p.then[0])
        if (c?.type !== 'output' || condOf(c) || refs.get(c.id) !== 1) return null
        if (Array.isArray(c.body) && c.body.length) return null
        return [p, c]
      }).find(Boolean)
      if (!pair) break

      const [p, c] = pair
      const joined = {
        ...p,
        then: Array.isArray(c.then) ? c.then : [],
        config: { ...p.config, items: [...(p.config?.items || []), ...(c.config?.items || [])] },
      }
      nodes = nodes.filter((n) => n !== c).map((n) => (n === p ? joined : n))
      merged.push({ nodeId: p.id, mergedId: c.id })
      changed = true
    }
    return changed ? { ...d, nodes } : d
  })

  if (!merged.length) return { flow, merged }
  return { flow: { ...flow, dialogs: newDialogs }, merged }
}

// 루프 누적 배열 변수 자동 초기화(결정론적 안전장치). 규칙(Value Generation Rule)이 "[] 초기화"를
// 지시하지만 LLM이 빠뜨리면 본문의 X.concat(...)이 첫 반복에서 undefined.concat()으로 터진다.
// → 루프 본문에서 X = X.concat(...)로 누적하는 변수 X를, 루프 진입 직전 init set에 X=[]로 자동 추가.
// (exitVar를 false로 init하는 autoInitFlag와 동형. 결과 저장 전 in-memory 정리라 누수 없음.)

// value가 "<key>.concat(" 로 시작하면 그 set은 key를 누적하는 노드(자기참조 누적).
function accumulatedKey(item: any): string | null {
  const key = typeof item?.key === "string" ? item.key.trim() : ""
  const val = typeof item?.value === "string" ? item.value.trim() : ""
  if (!key || !val) return null
  return val.startsWith(`${key}.concat(`) ? key : null
}

export function initLoopAccumulators(generatedJson: any): { initialized: number } {
  const dialogs = generatedJson?.dialogs
  if (!Array.isArray(dialogs)) return { initialized: 0 }
  let initialized = 0

  for (const dialog of dialogs) {
    const nodes: any[] = Array.isArray(dialog?.nodes) ? dialog.nodes : []
    if (nodes.length === 0) continue
    const byId = new Map(nodes.map((n) => [n.id, n]))

    for (const L of [...nodes]) {
      if (L?.type !== "subflow" || !Array.isArray(L.body) || L.body.length === 0) continue
      const cont = new Set<string>(Array.isArray(L.then) ? L.then : [])

      // 본문 멤버(루트에서 then으로 도달, continuation 진입 제외) 중 누적 key 수집
      const members = new Set<string>()
      const queue = [...L.body]
      while (queue.length) {
        const id = queue.shift()!
        if (members.has(id) || cont.has(id) || !byId.has(id)) continue
        members.add(id)
        for (const nx of (byId.get(id)!.then || [])) if (!cont.has(nx)) queue.push(nx)
      }
      const accKeys = new Set<string>()
      for (const id of members) {
        const n = byId.get(id)!
        if (n.type !== "set") continue
        for (const it of (n.config?.items || [])) {
          const k = accumulatedKey(it)
          if (k) accKeys.add(k)
        }
      }
      if (accKeys.size === 0) continue

      // 진입 직전 init set 노드 확보: 관례상 `${L.id}__init`. 없으면 만들어 L의 부모를 재배선.
      let init = byId.get(`${L.id}__init`)
      if (!init || init.type !== "set") {
        init = {
          id: `${L.id}__init`, type: "set", label: "누적 변수 초기화", condition: "",
          config: { items: [] }, then: [L.id], actions: [],
        }
        const rewire = (arr?: string[]) => Array.isArray(arr) ? arr.map((t) => (t === L.id ? init!.id : t)) : arr
        for (const m of nodes) m.then = rewire(m.then)
        if (Array.isArray(dialog.then)) dialog.then = rewire(dialog.then)
        nodes.push(init)
        byId.set(init.id, init)
      }
      if (!Array.isArray(init.config)) init.config = init.config || {}
      if (!Array.isArray(init.config.items)) init.config.items = []
      const have = new Set(init.config.items.map((it: any) => it?.key))
      for (const k of accKeys) {
        if (have.has(k)) continue
        init.config.items.push({ key: k, value: "[]", condition: "" })
        initialized++
      }
    }
  }

  return { initialized }
}

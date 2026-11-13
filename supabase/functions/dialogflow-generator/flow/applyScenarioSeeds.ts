// applyScenarioSeeds: 시나리오 레퍼런스 구조 시드(결정론).
// 설문에서 "레퍼런스 선택"된 시나리오의 서브트리를 레퍼런스 시나리오 복제본으로 교체한다.
// 구조·멘트는 레퍼런스(수동 교정본) 그대로, 설문 맞춤은 진입 발화 갱신만(v1 경계 — 스펙 참조).
// 실패(레퍼런스 미존재·매칭 실패)는 skipped 기록 후 봇 무변경 — 생성 무해성.

// scenarioPortion(few-shot용, then만 순회)은 이 파일에서 쓰지 않는다 — 시드 복제는 body(루프
// 서브다이얼로그의 자식)도 포함해야 하므로 아래 seedPortion(then+body 순회)을 자체로 둔다.

export interface SeedSelection { scenarioName: string; refKey: string; trigger: string; collectCount: number }
export interface RefRow { id: string; name: string; flow_json: any }
export interface SeededMeta {
  scenario: string; ref: string; ref_id: string
  mismatch: string; node_type_sequence: string[]; skipped: string
}
export interface SeedResult { seeded: SeededMeta[] }

export function collectSeedSelections(responses: Record<string, any>): SeedSelection[] {
  const out: SeedSelection[] = []
  for (const v of Object.values(responses || {})) {
    if (!Array.isArray(v)) continue
    for (const scen of v) {
      const name = String(scen?.["시나리오 이름"] || "").trim()
      const refKey = String(scen?.["레퍼런스 선택"] || "").trim()
      if (!name || !refKey) continue
      const trigger = String(scen?.["진입 발화"] || "").split("\n")[0].trim()
      const collects = scen?.["수집 정보"]
      const collectCount = Array.isArray(collects) ? collects.length : 0
      out.push({ scenarioName: name, refKey, trigger, collectCount })
    }
  }
  return out
}

// main 다이얼로그에서 시나리오 루트 탐색 — applyLlmBlocks의 기준과 동일(진입 발화 조건 포함 또는 라벨/이름 매칭).
function findScenarioRoot(main: any, seed: SeedSelection): any | null {
  for (const id of (main.then || [])) {
    const n = (main.nodes || []).find((x: any) => x.id === id)
    if (!n || n.type === "greeting" || n.type === "fallback") continue
    const cond = String(n.condition || "")
    const label = `${n.label || ""}${n.name || ""}`
    if ((seed.trigger && cond.includes(seed.trigger)) || label.includes(seed.scenarioName)) return n
  }
  return null
}

function reachable(nodes: any[], starts: string[]): Set<string> {
  const byId = new Map(nodes.map((n: any) => [n.id, n]))
  const seen = new Set<string>(); const q = [...starts]
  while (q.length) {
    const id = q.shift()!
    if (seen.has(id) || !byId.has(id)) continue
    seen.add(id)
    const n = byId.get(id)
    for (const t of (n.then || [])) q.push(t)
    for (const b of (n.body || [])) q.push(b)
  }
  return seen
}

// Fix M-b: 시드 복제 전용 시나리오 부분 추출. scenarioExamples.ts의 scenarioPortion(few-shot용)은
// then만 순회해 subflow 루프의 body 자식을 놓친다(도매·의료처럼 루프 보유 레퍼런스에서 복제가 깨짐).
// 여기서는 이 파일의 reachable()(then+body 순회)을 재사용해 body 자식까지 portion에 포함한다.
function seedPortion(flowJson: any): any[] {
  const main = (flowJson?.dialogs || []).find((d: any) => d?.id === "main")
  if (!main) return []
  const byId = new Map<string, any>((main.nodes || []).map((n: any) => [n.id, n]))
  const wId = (main.then || []).find((id: string) => byId.get(id)?.type === "greeting")
  const aId = (main.then || []).find((id: string) => byId.get(id)?.type === "fallback" || id === "fallback")
  const boiler = new Set<string>([
    ...reachable(main.nodes || [], wId ? [wId] : []),
    ...reachable(main.nodes || [], aId ? [aId] : []),
  ])
  const roots = (main.then || []).filter((id: string) => id !== wId && id !== aId)
  const scenIds = reachable(main.nodes || [], roots)
  return (main.nodes || []).filter((n: any) => scenIds.has(n.id) && !boiler.has(n.id))
}

export function applyScenarioSeeds(json: any, seeds: SeedSelection[], refRows: RefRow[]): SeedResult {
  const seeded: SeededMeta[] = []
  const main = (json?.dialogs || []).find((d: any) => d?.id === "main")
  seeds.forEach((seed, i) => {
    const meta: SeededMeta = { scenario: seed.scenarioName, ref: "", ref_id: "", mismatch: "", node_type_sequence: [], skipped: "" }
    seeded.push(meta)
    if (!main) { meta.skipped = "main 다이얼로그 없음"; return }
    const ref = (refRows || []).find((r) => r.id === seed.refKey || r.name === seed.refKey)
    if (!ref) { meta.skipped = `레퍼런스 없음: ${seed.refKey}`; return }
    meta.ref = ref.name; meta.ref_id = ref.id
    const portion = seedPortion(ref.flow_json)
    if (portion.length === 0) { meta.skipped = "레퍼런스 시나리오 노드 0개"; return }

    // 복제 + id 접두사 재작성
    const prefix = `seed${i}_`
    const portionIds = new Set(portion.map((n: any) => n.id))
    const rewrite = (id: string) => (portionIds.has(id) ? `${prefix}${id}` : id)
    const clones = portion.map((n: any) => {
      const c = structuredClone(n)
      c.id = `${prefix}${c.id}`
      c.then = (c.then || []).map(rewrite).filter((id: string) => id.startsWith(prefix))
      if (Array.isArray(c.body)) c.body = c.body.map(rewrite).filter((id: string) => id.startsWith(prefix))
      return c
    })
    // 복제 루트 = 다른 복제 노드의 then/body가 가리키지 않는 노드
    const referenced = new Set(clones.flatMap((c: any) => [...(c.then || []), ...(c.body || [])]))
    const cloneRoots = clones.filter((c: any) => !referenced.has(c.id)).map((c: any) => c.id)

    // Rider 3: 순환 참조 등으로 복제 루트를 하나도 못 찾으면(모든 클론이 서로 참조) 노드를
    // push하기 전에 판정 — 봇 무변경 보장.
    if (cloneRoots.length === 0) { meta.skipped = "복제 루트 없음(순환 참조)"; return }

    // Fix C1: 복제 루트(레퍼런스의 진입 노드) 중 트리거성 condition을 가진 노드는 condition을 제거한다.
    // 바깥 entry(설문 진입 발화로 게이트)가 이미 존재/생성되므로, 복제 루트에 레퍼런스 고유 트리거
    // condition이 남아있으면 "entry(설문 발화) → seed 루트(레퍼런스 발화)" 이중 게이트가 되어
    // 설문 진입 발화가 레퍼런스와 다르면 도달 불가(2026-07-07 최종 리뷰 Critical).
    const cloneRootSet = new Set(cloneRoots)
    for (const c of clones) {
      if (cloneRootSet.has(c.id) && c.condition) c.condition = ""
    }

    // 기존 시나리오 루트 찾아 서브트리 제거(진입 노드는 유지) 또는 진입 노드 결정론 생성
    let entry = findScenarioRoot(main, seed)
    if (entry) {
      const removeIds = reachable(main.nodes, entry.then || [])
      // 다른 루트에서도 도달 가능한 노드는 보존(공유 노드 안전)
      const otherRoots = (main.then || []).filter((id: string) => id !== entry.id)
      const keep = reachable(main.nodes, otherRoots)
      main.nodes = main.nodes.filter((n: any) => !removeIds.has(n.id) || keep.has(n.id) || n.id === entry.id)
    } else {
      const trig = (seed.trigger || seed.scenarioName).replace(/'/g, "\\'")
      entry = {
        id: `${prefix}entry`, type: "node", label: `${seed.scenarioName} 시나리오 시작(시드)`,
        condition: `input.text.includes('${trig}')`, then: [], config: { auth: false },
      }
      main.nodes.push(entry)
      // fallback 앞에 진입 루트 삽입(루트 순서 관례 유지)
      const aeIdx = (main.then || []).findIndex((id: string) =>
        (main.nodes.find((x: any) => x.id === id) || {}).type === "fallback")
      if (aeIdx >= 0) main.then.splice(aeIdx, 0, entry.id)
      else main.then.push(entry.id)
    }
    entry.then = cloneRoots
    main.nodes.push(...clones)
    meta.node_type_sequence = portion.map((n: any) => String(n.type))

    // v1 경계: 설문 수집항목 수 vs 레퍼런스 input 노드 수 불일치 경고
    const refInputs = clones.filter((c: any) => c.type === "input").length
    if (seed.collectCount > 0 && refInputs !== seed.collectCount) {
      meta.mismatch = `수집항목 상이: 설문 ${seed.collectCount}개 vs 레퍼런스 input ${refInputs}개`
    }
  })
  return { seeded }
}

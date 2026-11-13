// 여러 시나리오 미니봇을 하나의 완전한 봇으로 조립한다(결정론적).
// - greeting·Pre/Post·fallback 보일러플레이트는 첫 봇 것 하나만 유지.
// - 각 시나리오는 형제 루트로 합치되, 노드 id는 소스별 prefix(s{i}_)로 충돌 방지.
// - ESD 스키마/변수 키 충돌은 검사해서 경고만 한다(자동 해결 X).

interface AnyNode { id: string; type?: string; then?: string[]; body?: string[]; config?: any; [k: string]: any }

function mainOf(bot: any): any {
  return (bot?.dialogs || []).find((d: any) => d?.id === "main")
}

// startIds에서 then·body(루프 subflow 본문)를 따라 도달하는 노드 id 집합(stop은 제외).
function reachableFrom(byId: Map<string, AnyNode>, startIds: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...startIds]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id) || !byId.has(id)) continue
    seen.add(id)
    const node = byId.get(id)!
    for (const c of (node.then || [])) queue.push(c)
    for (const c of (node.body || [])) queue.push(c)
  }
  return seen
}

function greetingIdOf(main: any, byId: Map<string, AnyNode>): string | undefined {
  return (main.then || []).find((id: string) => byId.get(id)?.type === "greeting")
}
function anythingElseIdOf(main: any, byId: Map<string, AnyNode>): string | undefined {
  return (main.then || []).find((id: string) => byId.get(id)?.type === "fallback" || id === "fallback")
}

function esdFieldSig(cfg: any): string {
  const q = cfg?.query || {}
  const fields: string[] = []
  if (q.data && typeof q.data === "object") fields.push(...Object.keys(q.data))
  if (Array.isArray(q.where)) for (const w of q.where) if (w?.field) fields.push(w.field)
  return [...new Set(fields)].sort().join(",")
}

export function assembleScenarios(miniBots: any[]): { flow_json: any; warnings: string[] } {
  const warnings: string[] = []
  const bots = (miniBots || []).filter((b) => b && mainOf(b))
  if (bots.length === 0) return { flow_json: null, warnings: ["조립할 시나리오가 없습니다."] }

  // 첫 봇을 베이스로 — 보일러플레이트(greeting 서브트리 + fallback 서브트리) 유지
  const base = structuredClone(bots[0])
  const baseMain = mainOf(base)
  const baseById = new Map<string, AnyNode>(baseMain.nodes.map((n: AnyNode) => [n.id, n]))
  const greetingId = greetingIdOf(baseMain, baseById)
  const aeId = anythingElseIdOf(baseMain, baseById)

  const boiler = new Set<string>()
  if (greetingId) for (const id of reachableFrom(baseById, [greetingId])) boiler.add(id)
  if (aeId) for (const id of reachableFrom(baseById, [aeId])) boiler.add(id)

  const mergedNodes: AnyNode[] = baseMain.nodes.filter((n: AnyNode) => boiler.has(n.id))
  const mergedRoots: string[] = []

  const schemaSig: Record<string, string> = {}   // schemaName -> 필드 시그니처
  const varOwner: Record<string, number> = {}     // 변수 key -> 소유 봇 인덱스

  bots.forEach((bot, i) => {
    const main = mainOf(bot)
    const byId = new Map<string, AnyNode>((main.nodes || []).map((n: AnyNode) => [n.id, n]))
    const wId = greetingIdOf(main, byId)
    const aId = anythingElseIdOf(main, byId)
    const boilerThis = new Set<string>()
    if (wId) for (const id of reachableFrom(byId, [wId])) boilerThis.add(id)
    if (aId) for (const id of reachableFrom(byId, [aId])) boilerThis.add(id)

    const roots = (main.then || []).filter((id: string) => id !== wId && id !== aId)
    const scenIds = reachableFrom(byId, roots)

    // 시나리오 노드 id에 소스별 prefix 부여
    const idMap: Record<string, string> = {}
    for (const id of scenIds) if (!boilerThis.has(id)) idMap[id] = `s${i}_${id}`

    for (const oldId of Object.keys(idMap)) {
      const node = structuredClone(byId.get(oldId)!)
      node.id = idMap[oldId]
      node.then = (node.then || []).map((c: string) => idMap[c] || c)
      if (Array.isArray(node.body)) node.body = node.body.map((c: string) => idMap[c] || c)
      mergedNodes.push(node)

      const cfg = node.config || {}
      if (node.type === "esd" && cfg.schemaName) {
        const sig = esdFieldSig(cfg)
        if (schemaSig[cfg.schemaName] != null && schemaSig[cfg.schemaName] !== sig) {
          warnings.push(`ESD 스키마 '${cfg.schemaName}' 의 필드가 시나리오 간 다릅니다 — 합칠 때 확인하세요.`)
        } else if (schemaSig[cfg.schemaName] == null) {
          schemaSig[cfg.schemaName] = sig
        }
      }
      const keys: string[] = []
      if (node.type === "set") for (const it of (cfg.items || [])) if (it?.key) keys.push(it.key)
      if (node.type === "esd") for (const r of (cfg.result || [])) if (r?.key) keys.push(r.key)
      for (const k of keys) {
        if (varOwner[k] != null && varOwner[k] !== i) {
          warnings.push(`변수 '${k}' 가 여러 시나리오에서 쓰입니다 — 의미 충돌 여부를 확인하세요.`)
        } else if (varOwner[k] == null) {
          varOwner[k] = i
        }
      }
    }
    for (const r of roots) if (idMap[r]) mergedRoots.push(idMap[r])
  })

  baseMain.nodes = mergedNodes
  baseMain.then = [greetingId, ...mergedRoots, aeId].filter(Boolean)

  return { flow_json: base, warnings: [...new Set(warnings)] }
}

// ── 자산 병합 (v0.10.0 항목 5) ──────────────────────────────────────
// flow 조립(위)이 노드를 합치는 동안, 이쪽은 등록된 자산(ESD·인텐트·엔티티·API)을 합친다.
// 전부 name 기준 중복 제거. 엔티티 values 합집합이 주 경로다 —
// 하나의 엔티티가 여러 시나리오에 걸치는 것이 설계 의도이기 때문이다(_shared/deriveNlpData.ts).

export interface ScenarioAssetBundle {
  esd_schemas: any[]
  nlp: { intents: any[]; entities: any[] }
  api_defs: any[]
}

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const nameOf = (v: any): string => String(v?.name ?? "").trim()

/** ESD 스키마의 필드 이름 시그니처 — 같은 이름인데 내용이 다른지 가른다. */
function schemaFieldSig(schema: any): string {
  return asArray(schema?.fields).map((f: any) => String(f?.name ?? "")).sort().join(",")
}

export function mergeScenarioAssets(list: ScenarioAssetBundle[]): { assets: ScenarioAssetBundle; warnings: string[] } {
  const warnings: string[] = []
  const esd = new Map<string, any>()
  const intents = new Map<string, any>()
  const entities = new Map<string, any>()
  const apis = new Map<string, any>()

  for (const one of asArray(list)) {
    for (const s of asArray(one?.esd_schemas)) {
      const n = nameOf(s)
      if (!n) continue
      const prev = esd.get(n)
      if (!prev) { esd.set(n, s); continue }
      if (schemaFieldSig(prev) !== schemaFieldSig(s)) {
        warnings.push(`ESD 스키마 '${n}' 의 필드가 자산 간 다릅니다 — 먼저 고른 쪽을 씁니다.`)
      }
    }

    for (const i of asArray(one?.nlp?.intents)) {
      const n = nameOf(i)
      if (!n) continue
      const prev = intents.get(n)
      if (!prev) { intents.set(n, { ...i, examples: [...asArray(i?.examples)] }); continue }
      // 예문이 많은 게 손해가 아니다 — 합집합.
      for (const ex of asArray(i?.examples)) if (!prev.examples.includes(ex)) prev.examples.push(ex)
    }

    for (const e of asArray(one?.nlp?.entities)) {
      const n = nameOf(e)
      if (!n) continue
      const prev = entities.get(n)
      if (!prev) { entities.set(n, { ...e, values: [...asArray(e?.values)] }); continue }
      const seen = new Set(prev.values.map((v: any) => String(v?.value ?? "")))
      for (const v of asArray(e?.values)) {
        const key = String(v?.value ?? "")
        if (seen.has(key)) continue
        seen.add(key)
        prev.values.push(v)
      }
    }

    for (const d of asArray(one?.api_defs)) {
      const n = nameOf(d)
      if (!n || apis.has(n)) continue
      apis.set(n, d)
    }
  }

  return {
    assets: {
      esd_schemas: [...esd.values()],
      nlp: { intents: [...intents.values()], entities: [...entities.values()] },
      api_defs: [...apis.values()],
    },
    warnings: [...new Set(warnings)],
  }
}

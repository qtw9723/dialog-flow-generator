// Mode A: 카테고리 시나리오 레퍼런스를 designFlow few-shot 예시로 변환한다.
// - extractCategory: 응답에서 산업군(카테고리) 추출
// - selectExamples: 사용자 시나리오 이름과 관련된 상위 K개 선택
// - renderExamples: 미니봇에서 시나리오 부분만 추려 프롬프트용 텍스트로

const CATEGORIES = ["금융", "물류", "소매", "도매", "의료", "기타"]

// 응답(역할별)에서 산업군 값(카테고리 enum과 일치하는 답)을 찾는다.
export function extractCategory(responsesByRole: Record<string, any>): string {
  for (const roleVal of Object.values(responsesByRole || {})) {
    if (!roleVal || typeof roleVal !== "object") continue
    for (const v of Object.values(roleVal as Record<string, any>)) {
      if (typeof v === "string" && CATEGORIES.includes(v.trim())) return v.trim()
    }
  }
  return ""
}

// 사용자 시나리오 이름과의 관련도로 상위 K개 레퍼런스 선택(부족분은 순서대로 채움).
export function selectExamples(refs: any[], userScenarioNames: string[] = [], k = 3): any[] {
  if (!Array.isArray(refs) || refs.length === 0) return []
  const names = (userScenarioNames || []).map((s) => String(s || "")).filter(Boolean)
  const score = (ref: any): number => {
    const rn = String(ref?.name || "")
    let s = 0
    for (const un of names) {
      if (rn.includes(un) || un.includes(rn)) { s += 2; continue }
      const tokens = un.split(/\s+/).filter((t) => t.length >= 2)
      if (tokens.some((t) => rn.includes(t))) s += 1
    }
    return s
  }
  return refs
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .slice(0, k)
    .map((x) => x.r)
}

function mainOf(bot: any): any {
  return (bot?.dialogs || []).find((d: any) => d?.id === "main")
}

// 미니봇에서 보일러플레이트(greeting·fallback 서브트리)를 제외한 시나리오 노드만 반환.
export function scenarioPortion(flowJson: any): any[] {
  const main = mainOf(flowJson)
  if (!main) return []
  const byId = new Map<string, any>((main.nodes || []).map((n: any) => [n.id, n]))
  const reach = (starts: string[]) => {
    const seen = new Set<string>(); const q = [...starts]
    while (q.length) { const id = q.shift()!; if (seen.has(id) || !byId.has(id)) continue; seen.add(id); for (const c of (byId.get(id).then || [])) q.push(c) }
    return seen
  }
  const wId = (main.then || []).find((id: string) => byId.get(id)?.type === "greeting")
  const aId = (main.then || []).find((id: string) => byId.get(id)?.type === "fallback" || id === "fallback")
  const boiler = new Set<string>([...reach(wId ? [wId] : []), ...reach(aId ? [aId] : [])])
  const roots = (main.then || []).filter((id: string) => id !== wId && id !== aId)
  const scenIds = reach(roots)
  return (main.nodes || []).filter((n: any) => scenIds.has(n.id) && !boiler.has(n.id))
}

function nodeLine(n: any): string {
  const cfg = n.config || {}
  let extra = ""
  if (n.type === "set") extra = " " + (cfg.items || []).map((it: any) => `${it.key}=${it.value}`).join(",")
  else if (n.type === "esd") extra = ` ${cfg.type || ""} ${cfg.schemaName || ""}`
  else if (n.type === "output") {
    const t = cfg.items?.find((it: any) => it?.type === "text")?.text?.[0]?.texts?.[0]
    if (t) extra = ` "${String(t).slice(0, 40)}"`
  }
  const cond = n.condition ? ` [${n.condition}]` : ""
  return `    - ${n.type}${cond}${extra}${n.then?.length ? ` → ${n.then.join(",")}` : ""}`
}

// 선택된 레퍼런스들을 designFlow 프롬프트용 예시 텍스트로. 비면 "".
export function renderExamples(refs: any[]): string {
  if (!Array.isArray(refs) || refs.length === 0) return ""
  const blocks = refs.map((r) => {
    const nodes = scenarioPortion(r.flow_json)
    if (nodes.length === 0) return ""
    return `  예시 "${r.name}"${r.category ? ` (${r.category})` : ""}:\n${nodes.map(nodeLine).join("\n")}`
  }).filter(Boolean)
  return blocks.length ? blocks.join("\n") : ""
}

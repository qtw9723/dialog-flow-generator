// ESD 스키마 필드 계산 (공유 헬퍼, 순수 함수).
//
// ⚠ 왜 만들었나(2026-10-14): 조회(findone·findall)가 **무엇을 돌려주는지**가 파이프라인 어디에도
//    없었다. 필드는 create의 data 키 + where 필드에서만 모였고, 그 계산이 두 벌(fillValues의
//    computeSchemaFields · deriveEsdSchemas의 collectEsdFields)이었으며 schemaName 위치도 서로 다르게
//    읽었다. 프로덕션 실측: 조회 노드 30개 중 27개가 스키마에 조회 키 외 필드 0개 → 멘트 미사용 73%,
//    스키마에 없는 키 16%. 설계: docs/superpowers/specs/2026-10-14-esd-lookup-result-fields-design.md
//
// 핵심: 조회 노드마다 resultFields(돌려받는 필드)를 정하고, **멘트 프롬프트와 ESD 스키마가 같은 목록**을
//      쓴다 → 멘트가 쓰는 키 = 스키마에 있는 키.

const FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
/** 한 조회 노드에서 받는 resultFields 상한 — LLM이 필드를 끝없이 늘어놓는 것을 막는다. */
const MAX_RESULT_FIELDS = 12
const LOOKUP_TYPES = new Set(["findone", "findall"])

/** 실제 생성 노드는 schemaName을 config.query.schemaName에 두기도 한다(구버전/일부는 config.schemaName). */
export function esdSchemaNameOf(node: any): string | null {
  const name = node?.config?.query?.schemaName ?? node?.config?.schemaName
  return typeof name === "string" && name ? name : null
}

export function isEsdLookup(node: any): boolean {
  return node?.type === "esd" && LOOKUP_TYPES.has(node?.config?.type)
}

function cleanKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const k of raw) {
    if (typeof k !== "string") continue
    const key = k.trim()
    if (FIELD_KEY.test(key) && !out.includes(key)) out.push(key)
    if (out.length >= MAX_RESULT_FIELDS) break
  }
  return out
}

/**
 * config 패스 응답(패치)에서 조회 노드의 resultFields를 꺼낸다. nodeId → 영문 필드 키[].
 * 패치의 resultFields는 노드에 쓰지 않는다(applyFillPatches는 모르는 키를 무시) — 봇 JSON 왕복 무손실.
 */
export function extractResultFields(nodes: any[], patches: Record<string, any>): Record<string, string[]> {
  const byId = new Map<string, any>(nodes.map((n) => [n?.id, n]))
  const out: Record<string, string[]> = {}
  for (const [id, patch] of Object.entries(patches || {})) {
    if (!isEsdLookup(byId.get(id))) continue
    const keys = cleanKeys(patch?.resultFields)
    if (keys.length) out[id] = keys
  }
  return out
}

function whereFieldsOf(node: any): string[] {
  const where = node?.config?.query?.where
  return Array.isArray(where) ? where.map((w: any) => w?.field).filter((f: unknown): f is string => typeof f === "string" && !!f) : []
}

/**
 * 조회 노드별 resultFields를 schemaName 단위로 확정한다.
 * 우선순위: 선행 확정 ESD(esdBundle) 엔티티 > LLM 추론(설문 '받을 정보'는 LLM이 영문 키로 옮겨 여기 들어온다).
 * 선행 ESD가 있으면 그 엔티티에 실제로 있는 필드만 허용한다(없는 키를 스키마에 새로 만들지 않는다).
 */
export function resolveResultFields(
  nodes: any[],
  llmFieldsByNode: Record<string, string[]>,
  esdBundle?: any,
): Record<string, string[]> {
  const entities: any[] = Array.isArray(esdBundle?.entities) ? esdBundle.entities : []
  const entityFields = new Map<string, string[]>(
    entities.map((e) => [e?.name, (Array.isArray(e?.fields) ? e.fields : []).map((f: any) => f?.name).filter(Boolean)]),
  )
  const out: Record<string, string[]> = {}
  for (const n of nodes) {
    if (!isEsdLookup(n)) continue
    const schema = esdSchemaNameOf(n)
    if (!schema) continue
    const llm = llmFieldsByNode[n.id] || []
    let picked: string[]
    const confirmed = entityFields.get(schema)
    if (confirmed) {
      const allowed = llm.filter((k) => confirmed.includes(k))
      const where = whereFieldsOf(n)
      picked = allowed.length ? allowed : confirmed.filter((f) => !where.includes(f))
    } else {
      picked = llm
    }
    const acc = out[schema] || (out[schema] = [])
    for (const k of picked) if (!acc.includes(k)) acc.push(k)
  }
  for (const k of Object.keys(out)) if (out[k].length === 0) delete out[k]
  return out
}

/**
 * schemaName → 스키마 필드(순서 보존·중복 제거) = create data 키(값이 바인딩된 것만) ∪ where 필드 ∪ resultFields.
 * 멘트 변수 목록(fillValues)과 ESD 스키마 파생(deriveEsdSchemas)이 모두 이걸 쓴다.
 */
export function schemaFieldsOf(nodes: any[], resultFieldsBySchema: Record<string, string[]> = {}): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (schema: string, f: unknown) => {
    const list = out[schema] || (out[schema] = [])
    if (typeof f === "string" && f && !list.includes(f)) list.push(f)
  }
  for (const n of nodes) {
    if (n?.type !== "esd") continue
    const schema = esdSchemaNameOf(n)
    if (!schema) continue
    if (!out[schema]) out[schema] = []
    // create: 값이 바인딩된 data 키만(빈 문자열 = 레퍼런스 템플릿 잔재 필드 제외)
    const data = n.config?.query?.data
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data)) if (v !== "" && v != null) add(schema, k)
    }
    for (const f of whereFieldsOf(n)) add(schema, f)
  }
  for (const [schema, fields] of Object.entries(resultFieldsBySchema)) {
    if (!out[schema]) continue // 노드가 없는 스키마는 만들지 않는다
    for (const f of fields) add(schema, f)
  }
  return out
}

function outputTexts(node: any): string[] {
  const out: string[] = []
  for (const it of node?.config?.items || []) {
    if (it?.type !== "text") continue
    for (const t of it.text || []) for (const s of t?.texts || []) if (typeof s === "string") out.push(s)
  }
  return out
}

const REF = /\$\{([^}]+)\}/g

/** 조회 노드가 결과(_result)를 담는 변수들. */
function resultVarsOf(node: any): string[] {
  return (node?.config?.result || [])
    .filter((r: any) => typeof r?.key === "string" && typeof r?.value === "string" && r.value.includes("_result"))
    .map((r: any) => r.key as string)
}

/** 노드의 하류(then 전체, 사이클 안전) output 멘트들. */
function downstreamOutputTexts(byId: Map<string, any>, node: any): Array<{ nodeId: string; text: string }> {
  const out: Array<{ nodeId: string; text: string }> = []
  const visited = new Set<string>()
  const queue: string[] = [...(node?.then || [])]
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const m = byId.get(id)
    if (!m) continue
    queue.push(...(m.then || []))
    if (m.type === "output") for (const text of outputTexts(m)) out.push({ nodeId: m.id, text })
  }
  return out
}

/**
 * 조회 결과 변수를 하류 output 멘트가 **스키마에 없는 키**로 참조한 자리를 찾는다(관측용 — 교정하지 않는다).
 * `.length`(배열 건수)는 키가 아니므로 제외. 통째 참조(${var})는 기존 멘트 규칙의 영역이라 여기선 보지 않는다.
 */
export function findUnknownEsdRefs(
  nodes: any[],
  fieldsBySchema: Record<string, string[]>,
): Array<{ nodeId: string; ref: string; schemaName: string }> {
  const byId = new Map<string, any>(nodes.map((n) => [n?.id, n]))
  const found: Array<{ nodeId: string; ref: string; schemaName: string }> = []
  const seen = new Set<string>()
  for (const n of nodes) {
    if (!isEsdLookup(n)) continue
    const schema = esdSchemaNameOf(n)
    if (!schema) continue
    const fields = fieldsBySchema[schema] || []
    const vars = resultVarsOf(n)
    if (!vars.length) continue
    for (const { nodeId, text } of downstreamOutputTexts(byId, n)) {
      for (const match of text.matchAll(REF)) {
        const ref = match[1].trim()
        for (const v of vars) {
          if (!(ref.startsWith(v + ".") || ref.startsWith(v + "["))) continue
          const key = ref.slice(v.length).replace(/^\[\d+\]/, "").replace(/^\./, "").split(/[.[]/)[0]
          if (!key || key === "length" || fields.includes(key)) continue
          const sig = `${nodeId}|${ref}`
          if (!seen.has(sig)) { seen.add(sig); found.push({ nodeId, ref, schemaName: schema }) }
        }
      }
    }
  }
  return found
}

/**
 * 결과를 하류 어떤 output 멘트도 쓰지 않는 조회 노드(관측용 — 교정하지 않는다).
 * 2026-10-14 실측에서 남은 미사용은 설문의 연동 목적과 '완료 시 결과'가 서로 다른 경우였다
 * (자격 변동 조회 → "본인부담금 조회되었습니다"). 생성기가 의도를 추측해 맞추지 않고 드러내기만 한다.
 */
export function findUnusedLookups(nodes: any[]): Array<{ nodeId: string; resultVar: string; schemaName: string | null }> {
  const byId = new Map<string, any>(nodes.map((n) => [n?.id, n]))
  const found: Array<{ nodeId: string; resultVar: string; schemaName: string | null }> = []
  for (const n of nodes) {
    if (!isEsdLookup(n)) continue
    const vars = resultVarsOf(n)
    if (!vars.length) continue
    const refs = downstreamOutputTexts(byId, n).flatMap(({ text }) => [...text.matchAll(REF)].map((m) => m[1].trim()))
    const used = refs.some((ref) => vars.some((v) => ref === v || ref.startsWith(v + ".") || ref.startsWith(v + "[")))
    if (!used) found.push({ nodeId: n.id, resultVar: vars[0], schemaName: esdSchemaNameOf(n) })
  }
  return found
}

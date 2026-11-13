// ESD 필드 ↔ 시나리오 수집변수 매핑 후보 산출 (순수함수 — 부수효과·네트워크 없음).
// src/lib/mapping/proposeMapping.js와 동일 알고리즘 — Deno/Edge Function용 TypeScript 이식.
// 두 파일의 계약(반환 타입·알고리즘 상수)은 항상 동기화돼야 한다.

function tokenizeName(name: string): string[] {
  return String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9가-힣]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
}

function normalizeName(name: string): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
}

function typeMatch(a: string, b: string): boolean {
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase()
}

function tokenOverlap(nameA: string, nameB: string): number {
  const setA = new Set(tokenizeName(nameA))
  const setB = new Set(tokenizeName(nameB))
  if (setA.size === 0 || setB.size === 0) return 0
  let shared = 0
  for (const t of setA) {
    if (setB.has(t)) shared++
  }
  return (2 * shared) / (setA.size + setB.size)
}

const PARTIAL_MIN = 0.3
const SCORE_THRESHOLD = 0.1

function scoreMatch(
  esdField: { name: string; type: string },
  collectVar: { name: string; type: string },
): number {
  const exactName = normalizeName(esdField.name) === normalizeName(collectVar.name)
  const sameType = typeMatch(esdField.type, collectVar.type)

  if (exactName && sameType) return 1.0
  if (exactName) return 0.8

  const overlap = tokenOverlap(esdField.name, collectVar.name)
  if (overlap < PARTIAL_MIN) return 0

  return sameType ? 0.4 + overlap * 0.2 : overlap * 0.3
}

export interface EsdFieldEntry {
  entityName: string
  name: string
  type: string
  key: boolean
  crypt: string
}

export interface MappingCandidate {
  varName: string
  varType: string
  score: number
}

export interface MappingEntry {
  esdField: EsdFieldEntry
  candidates: MappingCandidate[]
  auto: boolean
}

export interface ProposeMappingResult {
  mappings: MappingEntry[]
  unmappedEsdFields: EsdFieldEntry[]
  unmappedVars: Array<{ name: string; type: string }>
}

export function proposeMapping(
  esd: any,
  collectVars: Array<{ name: string; type: string }>,
): ProposeMappingResult {
  const entities: any[] = esd?.entities ?? []
  const vars = Array.isArray(collectVars) ? collectVars : []

  const esdFields: EsdFieldEntry[] = []
  for (const entity of entities) {
    for (const field of entity.fields ?? []) {
      esdFields.push({
        entityName: entity.name,
        name: field.name,
        type: field.type,
        key: field.key,
        crypt: field.crypt,
      })
    }
  }

  const rawMappings = esdFields.map((esdField) => {
    const candidates = vars
      .map((v) => ({ varName: v.name, varType: v.type, score: scoreMatch(esdField, v) }))
      .filter((c) => c.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
    return { esdField, candidates }
  })

  const perfectClaimCount = new Map<string, number>()
  for (const m of rawMappings) {
    const perfects = m.candidates.filter((c) => c.score === 1.0)
    if (perfects.length === 1) {
      const k = perfects[0].varName
      perfectClaimCount.set(k, (perfectClaimCount.get(k) ?? 0) + 1)
    }
  }

  const mappings: MappingEntry[] = rawMappings.map((m) => {
    const perfects = m.candidates.filter((c) => c.score === 1.0)
    const auto =
      perfects.length === 1 && perfectClaimCount.get(perfects[0].varName) === 1
    return { esdField: m.esdField, candidates: m.candidates, auto }
  })

  const unmappedEsdFields = mappings
    .filter((m) => m.candidates.length === 0)
    .map((m) => m.esdField)

  const candidateVarNames = new Set(
    mappings.flatMap((m) => m.candidates.map((c) => c.varName)),
  )
  const unmappedVars = vars.filter((v) => !candidateVarNames.has(v.name))

  return { mappings, unmappedEsdFields, unmappedVars }
}

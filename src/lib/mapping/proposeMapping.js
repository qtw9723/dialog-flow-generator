// ESD 필드 ↔ 시나리오 수집변수 매핑 후보 산출 (순수함수 — 부수효과·네트워크 없음).

import { tokenizeName } from '../esdFieldRules.js'

function normalizeName(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

function typeMatch(a, b) {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
}

// Dice coefficient of unique-token overlap between two names.
function tokenOverlap(nameA, nameB) {
  const setA = new Set(tokenizeName(nameA))
  const setB = new Set(tokenizeName(nameB))
  if (setA.size === 0 || setB.size === 0) return 0
  let shared = 0
  for (const t of setA) {
    if (setB.has(t)) shared++
  }
  return (2 * shared) / (setA.size + setB.size)
}

// Minimum Dice coefficient for a partial-match candidate to qualify.
const PARTIAL_MIN = 0.3

// Minimum score for a candidate to appear in the candidate list.
const SCORE_THRESHOLD = 0.1

/**
 * Compute similarity score between one ESD field and one collect var.
 * Returns 1.0 only for exact-name + type match (auto-confirm territory).
 */
function scoreMatch(esdField, collectVar) {
  const exactName = normalizeName(esdField.name) === normalizeName(collectVar.name)
  const sameType = typeMatch(esdField.type, collectVar.type)

  if (exactName && sameType) return 1.0
  if (exactName) return 0.8    // name exact, type mismatch

  const overlap = tokenOverlap(esdField.name, collectVar.name)
  if (overlap < PARTIAL_MIN) return 0

  // Partial name match: type bonus lifts score
  return sameType ? 0.4 + overlap * 0.2 : overlap * 0.3
}

/**
 * ESD 필드와 시나리오 수집변수를 이름·타입 유사도로 매핑 후보를 산출한다.
 *
 * - score=1.0(이름 완전일치·타입일치)이 1:1로 유일하면 auto=true (자동 확정 후보).
 * - 부분일치·타입불일치·다대다는 auto=false, candidates 목록 반환.
 * - 후보가 없는 ESD 필드 → unmappedEsdFields, 후보에 없는 수집변수 → unmappedVars.
 *
 * @param {object|null|undefined} esd  buildEsdJson 산출 ({ entities, apis })
 * @param {Array<{name:string,type:string}>|null|undefined} collectVars  시나리오 수집변수
 * @returns {{
 *   mappings: Array<{
 *     esdField: {entityName:string, name:string, type:string, key:boolean, crypt:string},
 *     candidates: Array<{varName:string, varType:string, score:number}>,
 *     auto: boolean,
 *   }>,
 *   unmappedEsdFields: Array<{entityName:string, name:string, type:string}>,
 *   unmappedVars: Array<{name:string, type:string}>,
 * }}
 */
export function proposeMapping(esd, collectVars) {
  const entities = esd?.entities ?? []
  const vars = Array.isArray(collectVars) ? collectVars : []

  // Flatten all ESD fields across entities.
  const esdFields = []
  for (const entity of entities) {
    for (const field of (entity.fields ?? [])) {
      esdFields.push({
        entityName: entity.name,
        name: field.name,
        type: field.type,
        key: field.key,
        crypt: field.crypt,
      })
    }
  }

  // Pass 1: score and rank candidates for each ESD field.
  const rawMappings = esdFields.map((esdField) => {
    const candidates = vars
      .map((v) => ({ varName: v.name, varType: v.type, score: scoreMatch(esdField, v) }))
      .filter((c) => c.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
    return { esdField, candidates }
  })

  // Pass 2: resolve 1:1 auto flag.
  // A var is "auto-claimable" only if exactly one ESD field has it as its sole score=1.0 match.
  const perfectClaimCount = new Map()
  for (const m of rawMappings) {
    const perfects = m.candidates.filter((c) => c.score === 1.0)
    if (perfects.length === 1) {
      const key = perfects[0].varName
      perfectClaimCount.set(key, (perfectClaimCount.get(key) ?? 0) + 1)
    }
  }

  const mappings = rawMappings.map((m) => {
    const perfects = m.candidates.filter((c) => c.score === 1.0)
    const auto =
      perfects.length === 1 &&
      perfectClaimCount.get(perfects[0].varName) === 1
    return { esdField: m.esdField, candidates: m.candidates, auto }
  })

  const unmappedEsdFields = mappings
    .filter((m) => m.candidates.length === 0)
    .map((m) => m.esdField)

  const candidateVarNames = new Set(
    mappings.flatMap((m) => m.candidates.map((c) => c.varName))
  )
  const unmappedVars = vars.filter((v) => !candidateVarNames.has(v.name))

  return { mappings, unmappedEsdFields, unmappedVars }
}

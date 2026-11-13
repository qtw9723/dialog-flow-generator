// 연결선 조건 가이드 빌더용 순수 헬퍼 (UI 무의존).
// 조건식은 런타임 분기 표현식: input.text.includes('x'), _result != null, local.status == 'paid' 등.
// 스코프 접두사(local./context./secure.)와 특수변수(input.text/_result/_error)를 쓴다.

// 늘 제안하는 특수 변수 — 순서 유지(빌더 드롭다운 상단 노출)
export const SPECIAL_VARS = ['input.text', '_result', '_error']

// 빌더 연산자 정의. needsValue=값 입력 필요 여부.
export const OPERATORS = [
  { id: 'includes', label: '포함',   needsValue: true },
  { id: 'eq',       label: '같음(=)', needsValue: true },
  { id: 'neq',      label: '다름(≠)', needsValue: true },
  { id: 'exists',   label: '있음',   needsValue: false },
  { id: 'notexists', label: '없음',  needsValue: false },
  { id: 'true',     label: '참(true)',  needsValue: false },
  { id: 'false',    label: '거짓(false)', needsValue: false },
]

/**
 * flow_json에서 사용 가능한 변수 후보를 추출한다(특수변수 + set/api/esd가 정의하는 키).
 * 스코프 정합성(도달성)까지 따지지 않는 "제안 목록"이다 — 사용자가 직접 입력도 가능.
 * @param {object} flowJson
 * @returns {string[]} 특수변수 우선, 이후 정의된 변수(중복 제거)
 */
export function availableVars(flowJson) {
  const out = new Set(SPECIAL_VARS)
  for (const d of (flowJson?.dialogs || [])) {
    for (const n of (d?.nodes || [])) {
      for (const it of (n?.config?.items || [])) {
        if (it && typeof it.key === 'string' && it.key.trim()) out.add(it.key.trim())
      }
      for (const r of (n?.config?.result || [])) {
        if (r && typeof r.key === 'string' && r.key.trim()) out.add(r.key.trim())
      }
    }
  }
  return [...out]
}

function quoteValue(v) {
  const s = String(v ?? '').trim()
  if (s === 'true' || s === 'false' || s === 'null') return s
  if (/^-?\d+(\.\d+)?$/.test(s)) return s
  return `'${s.replace(/'/g, "\\'")}'`
}

function unquoteValue(v) {
  const s = String(v ?? '').trim()
  const m = s.match(/^['"](.*)['"]$/)
  return m ? m[1] : s
}

/**
 * 빌더 입력(subject/operator/value) → 조건식 문자열.
 * subject가 비면 '' 반환. includes에 값 없으면 '' 반환(불완전).
 */
export function buildConditionExpr(subject, operator, value) {
  const s = String(subject || '').trim()
  if (!s) return ''
  const v = String(value ?? '').trim()
  switch (operator) {
    case 'includes': return v ? `${s}.includes(${quoteValue(v)})` : ''
    case 'eq': return v !== '' ? `${s} == ${quoteValue(v)}` : ''
    case 'neq': return v !== '' ? `${s} != ${quoteValue(v)}` : ''
    case 'exists': return `${s} != null`
    case 'notexists': return `${s} == null`
    case 'true': return `${s} == true`
    case 'false': return `${s} == false`
    default: return ''
  }
}

/**
 * 조건식 → 빌더 필드(best-effort). 인식 못 하면 null(→ 고급/직접입력 모드로 폴백).
 * 빈 문자열은 기본 빌더 상태({subject:'', operator:'includes', value:''}) 반환.
 * @returns {{subject:string, operator:string, value:string}|null}
 */
export function parseCondition(expr) {
  const e = String(expr || '').trim()
  if (!e) return { subject: '', operator: 'includes', value: '' }
  let m
  if ((m = e.match(/^(.+?)\.includes\(\s*['"]([^'"]*)['"]\s*\)$/))) return { subject: m[1].trim(), operator: 'includes', value: m[2] }
  if ((m = e.match(/^(.+?)\s*!=\s*null$/))) return { subject: m[1].trim(), operator: 'exists', value: '' }
  if ((m = e.match(/^(.+?)\s*==\s*null$/))) return { subject: m[1].trim(), operator: 'notexists', value: '' }
  if ((m = e.match(/^(.+?)\s*==\s*true$/))) return { subject: m[1].trim(), operator: 'true', value: '' }
  if ((m = e.match(/^(.+?)\s*==\s*false$/))) return { subject: m[1].trim(), operator: 'false', value: '' }
  if ((m = e.match(/^(.+?)\s*==\s*(.+)$/))) return { subject: m[1].trim(), operator: 'eq', value: unquoteValue(m[2]) }
  if ((m = e.match(/^(.+?)\s*!=\s*(.+)$/))) return { subject: m[1].trim(), operator: 'neq', value: unquoteValue(m[2]) }
  return null
}

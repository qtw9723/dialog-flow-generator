// 날짜/시간 표시는 viewer 머신 타임존에 의존하지 않도록 항상 KST(Asia/Seoul)로 고정한다.
const KST = 'Asia/Seoul'

// timestamptz 값은 보통 오프셋(+00:00 / Z)을 포함하지만,
// 오프셋이 없는 naive 문자열로 들어오는 경우 UTC로 간주해 일관되게 해석한다.
function toDate(value) {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value.trim())
    const normalized = hasTz ? value : `${value.replace(' ', 'T')}Z`
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

// KST로 고정된 날짜+시간 문자열 (예: 2026. 6. 29. 오후 4:30:12)
export function formatKST(value, { fallback = '' } = {}) {
  const d = toDate(value)
  if (!d) return fallback
  return d.toLocaleString('ko-KR', { timeZone: KST })
}

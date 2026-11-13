// 결과 상세에 단계를 한 줄로 보여준다(순수).
const arr = (v) => (Array.isArray(v) ? v : [])
const t = (v) => String(v ?? '').trim()

/** 갈래 조건 한 줄(직접 입력 조건 우선). */
export const branchCondition = (r) => t(r?.['직접 입력 조건']) || [t(r?.['조건 대상']), t(r?.연산자), t(r?.값)].filter(Boolean).join(' ')
const afterOf = (r) => (r?.이후 === '여기서 종료' ? '종료' : '이어서')

/** 갈래 한 줄: 하위 단계가 있으면 `조건 → N단계(이어서)`, 없으면 `조건 → 행동(이어서)`. */
export function describeBranchRow(r) {
  const n = arr(r?.단계).length
  return `${branchCondition(r)} → ${n ? `${n}단계` : t(r?.['그 경우 봇의 행동'])}(${afterOf(r)})`
}

/** 결과 상세용 — 단계를 들여쓴 줄 목록으로 편다(갈래 하위 단계는 그 갈래 아래). */
export function describeFlow(steps, depth = 0) {
  const lines = []
  arr(steps).forEach((st, k) => {
    lines.push({ depth, label: `${k + 1}.`, text: describeStep(st) })
    if (st?.유형 !== '분기') return
    arr(st.갈래).forEach((r, j) => {
      if (!arr(r?.단계).length) return
      lines.push({ depth: depth + 1, label: `갈래 ${j + 1}`, text: `${branchCondition(r)} (${afterOf(r)})` })
      lines.push(...describeFlow(r.단계, depth + 2))
    })
  })
  return lines
}

export function describeStep(step) {
  const type = step?.유형 || '단계'
  if (type === '정보 받기') return `${type} · ${arr(step.항목).map((i) => t(i?.항목명) || t(i?.변수명)).filter(Boolean).join(', ')}`
  if (type === '안내') return `${type} · ${t(step.내용)}`
  if (type === '연동') {
    const raw = t(step['연동 방식'])
    const way = raw.includes('API') ? '(API)' : raw.includes('ESD') ? '(ESD)' : ''
    return `${type}${way} · ${t(step['연동 목적'])}`
  }
  if (type === '분기') return `${type} · ${arr(step.갈래).map(describeBranchRow).join(' / ')}`
  return type
}

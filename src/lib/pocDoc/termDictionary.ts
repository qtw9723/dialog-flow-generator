// 문서 용어 사전의 렌더·제안 (순수 모듈).
//
// 사전 자체는 DB(solution_rules의 'Document Term Mapping')에 있다.
// 여기는 그 행들을 받아 프롬프트 텍스트로 만들거나 열 이름을 필드로 제안만 한다.
// DB 접근을 이 모듈에 넣지 말 것 — 그러면 테스트가 붙지 않는다.

/** 문서의 열이 대응될 수 있는 우리 쪽 필드. 설문 시나리오 문항의 이름과 같다. */
export const MAPPABLE_FIELDS: readonly string[] = [
  '시나리오 이름', '진입 발화', '수집 정보', '완료 시 결과', '분기', '외부 연동',
]

export interface TermEntry {
  field: string
  terms: string[]
  /**
   * 추출 응답 스키마의 영문 키(name·trigger·collect·done·branches·integrations).
   * 제거된 하드코딩 대응표는 `시나리오 이름(name)`처럼 키를 명시했는데, 한글 라벨만 렌더하면
   * LLM이 한글 라벨과 응답 스키마의 영문 키를 잇지 못한다 — 그 다리를 다시 놓는 값이다.
   * 사전(DB)에 없을 수 있으므로 선택 항목이며, 없으면 라벨만 렌더한다.
   */
  key?: string
}

// [사용자 확정 열 매핑] 지침의 크기 상한. 학습 경로(learnTerms.ts)는 40자/20개로 막혀 있는데
// 프롬프트 경로가 무제한이면 병합셀 문서의 거대한 헤더나 열 200개짜리 표가 그대로 실린다.
const MAX_CONFIRMED_COLUMN_LEN = 60
const MAX_CONFIRMED_ITEMS = 40

// 제어문자를 공백으로 바꾸고, 연속 공백을 하나로 줄인 뒤 앞뒤를 다듬는다.
// ⚠ 문자 클래스는 반드시 \x 이스케이프로 쓴다. 리터럴 제어문자를 소스에 넣으면
//    읽을 수도 리뷰할 수도 없고, 범위를 잘못 쓰면 정상 문자를 파괴한다(실제로 그랬다).
const sanitize = (s: unknown): string =>
  String(s ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()

function usable(entries: unknown): TermEntry[] {
  if (!Array.isArray(entries)) return []
  return entries.filter(
    (e): e is TermEntry =>
      !!e && typeof e.field === 'string' && Array.isArray(e.terms) && e.terms.length > 0,
  )
}

/** 사전을 추출 프롬프트의 열 인식 지침으로 렌더한다. 사전이 비면 빈 문자열. */
export function renderLayoutGuide(entries: unknown): string {
  const rows = usable(entries)
  if (rows.length === 0) return ''
  const lines = rows
    .map((e) => {
      const cleanField = sanitize(e.field)
      const cleanTerms = e.terms.map(sanitize).filter((t) => t.length > 0)
      if (cleanField.length === 0 || cleanTerms.length === 0) return null
      // 사전에 영문 키가 있으면 `시나리오 이름(name)`으로 렌더한다 — 응답 스키마가 영문 키를 쓰므로
      // 라벨만 주면 LLM이 무슨 키에 넣어야 하는지 알 수 없다. 키가 없으면 라벨만.
      const cleanKey = sanitize(e.key)
      const label = cleanKey.length > 0 ? `${cleanField}(${cleanKey})` : cleanField
      return `- ${label}: ${cleanTerms.join(' · ')}`
    })
    .filter((line): line is string => line !== null)
  if (lines.length === 0) return ''
  return [
    '[문서(표) 레이아웃 인식 지침]',
    '입력이 문서·표 형식이면 다양한 열 이름에서 의미를 파악해 추출하세요:',
    ...lines,
    '열 이름이 위와 달라도 문맥으로 역할을 파악해 추출하고, 확신 없으면 해당 키 생략(날조 금지).',
  ].join('\n')
}

/** 열 이름에 대응하는 필드를 제안한다. 먼저 등록된 항목이 이긴다. */
export function suggestField(column: unknown, entries: unknown): string | null {
  const key = sanitize(String(column ?? '')).toLowerCase()
  if (key === '') return null
  for (const e of usable(entries)) {
    if (e.terms.some((t) => sanitize(t).toLowerCase() === key)) return e.field
  }
  return null
}

/** 사용자가 확정한 열 매핑을 강제 지침으로 렌더한다(선례: flow/esdContract.ts의 renderConfirmedMapping). */
export function renderConfirmedColumns(mapping: unknown): string {
  if (!Array.isArray(mapping) || mapping.length === 0) return ''
  const lines = mapping
    .filter((m) => m && typeof m.column === 'string' && typeof m.field === 'string')
    .map((m) => {
      const cleanColumn = sanitize(m.column)
      const cleanField = sanitize(m.field)
      if (cleanColumn.length === 0 || cleanField.length === 0) return null
      // 지나치게 긴 열 이름은 버린다(잘라 쓰면 원래 없던 이름을 지어내는 셈이 된다).
      if (cleanColumn.length > MAX_CONFIRMED_COLUMN_LEN) return null
      return `- "${cleanColumn}" 열은 ${cleanField}이다.`
    })
    .filter((line): line is string => line !== null)
    .slice(0, MAX_CONFIRMED_ITEMS)
  if (lines.length === 0) return ''
  return [
    '[사용자 확정 열 매핑]',
    '아래는 사용자가 직접 확인한 대응이다. 문맥 추론보다 **우선**한다.',
    ...lines,
  ].join('\n')
}

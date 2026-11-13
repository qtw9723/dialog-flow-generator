// 시나리오 템플릿 필드의 표시명·필수 여부를 코드에서 덮어쓴다(소비처 전용, 원본 불변).
//
// 왜 DB가 아니라 코드인가: templates 테이블은 dev 사본 없이 프로덕션과 공유한다(CLAUDE.md). DB를 고치면
// 개발 중인 변경이 곧바로 프로덕션 설문에 나간다 — 코드에 두면 릴리스와 함께 나간다.
// 저장 키(field.name)는 바꾸지 않는다 — 기존 결과·문서 인입(assembleResponses)·용어 매핑·회귀 하네스가 그 키를 쓴다.
// ⚠ 어드민 템플릿 편집기(TemplatesContext 원본)에는 적용하지 않는다 — 저장 시 덮어쓴 값이 DB로 새지 않게.

export const FIELD_OVERRIDES = {
  // 2026-10-19 사용자: 항상 output으로 끝나니 '마무리 안내'로 이름을 정리하고 선택 입력으로.
  // 비우면 생성 규칙(Output Message Rule)이 "업무 처리 완료 + 처리한 데이터"로 마무리 멘트를 쓴다.
  '완료 시 결과': { label: '시나리오 마무리 안내', required: false },
}

function overrideFields(fields) {
  if (!Array.isArray(fields)) return fields
  return fields.map((f) => {
    const o = f && FIELD_OVERRIDES[f.name]
    const next = o ? { ...f, ...o } : f
    return Array.isArray(next?.fields) ? { ...next, fields: overrideFields(next.fields) } : next
  })
}

/** 템플릿 사본에 FIELD_OVERRIDES를 적용한다. null/undefined는 그대로. */
export function withFieldOverrides(template) {
  if (!template) return template
  return { ...template, fields: overrideFields(template.fields) }
}

/** 화면에 보일 필드 이름. */
export const fieldLabel = (field) => field?.label || field?.name

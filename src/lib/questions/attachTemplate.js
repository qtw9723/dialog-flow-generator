// 질문에 템플릿 객체를 붙인다(순수).
//
// 왜 필요한가: `QuestionCard`는 `input_type === 'templated' && question.template`일 때만
// 시나리오 편집기(`ScenarioQuestionCard`)를 연다. template을 안 붙이고 넘기면 분기가 조용히
// 실패해 일반 텍스트 입력으로 폴백하고, 시나리오 객체 배열이 "[object Object]"로 뭉개진다.
// 게다가 `q.template`에 의존하는 시나리오 검증(validateScenarios)도 통째로 건너뛴다 —
// 표시가 깨지는 것보다 이쪽이 위험하다(필수 항목이 비어도 통과).
//
// 질문 목록(admin-questions)은 `template_id`만 주고 템플릿 본문은 별도 컨텍스트(TemplatesContext)에
// 있으므로, 소비처마다 이 결합을 해야 한다. 인라인으로 복사하면 새 소비처에서 빠뜨린다
// (실제로 ResultSurveyEdit가 그렇게 빠뜨려 이 버그가 났다).

/**
 * @param {object|null|undefined} question - 질문 행(`template_id` 포함 가능)
 * @param {Array<{id: string}>|null|undefined} templates - 로드된 템플릿 목록
 * @returns {object|null|undefined} template이 결합된 사본(원본 불변). 못 찾으면 template=null.
 */
import { withFieldOverrides } from './fieldOverrides.js'

export function attachTemplate(question, templates) {
  if (!question) return question
  const id = question.template_id
  const found = id ? (templates || []).find((t) => t?.id === id) : null
  // 표시명·필수 여부 덮어쓰기(fieldOverrides.js) — 설문 화면과 검증이 같은 템플릿을 보게 한다.
  return { ...question, template: found ? withFieldOverrides(found) : null }
}

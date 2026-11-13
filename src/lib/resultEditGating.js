// 결과 수정 화면의 순수 판정 헬퍼(UI 무의존). 설문 편집 노출 게이팅 + 응답 유무 판정.

/**
 * 설문 기반 수정을 노출할지 — 생성 경로 마커(generation_tiers.source) 기준.
 * 'nl'·'doc'(자연어·문서 생성)은 숨기고, 'survey' 및 마커 없는 레거시 결과는 노출한다(하위호환).
 * @param {object|null|undefined} result
 * @returns {boolean}
 */
export function isSurveyEditable(result) {
  // 업로드한 기존 챗봇은 원설문 자체가 없다 — 버튼을 보이면 눌러서 실패한다(v0.9.0).
  // 라이브러리 조립물도 같다 — 설문에서 나온 봇이 아니다(v0.10.0 항목 5).
  if (isUploadedResult(result) || isAssembledResult(result)) return false
  const source = result?.generation_tiers?.source
  return source !== 'nl' && source !== 'doc'
}

/**
 * 업로드한 기존 챗봇인가 — `reference_id`가 없고 `generation_tiers.upload`가 있으면.
 * (results 테이블에 source 컬럼이 없어 이 조합이 표식이다.)
 */
export function isUploadedResult(result) {
  return !!(result && result.reference_id == null && result.generation_tiers?.upload)
}

/**
 * 라이브러리에서 조립한 결과인가 — `reference_id`가 없고 `generation_tiers.assembly`가 있으면.
 * (results 테이블에 source 컬럼이 없어 이 조합이 표식이다 — isUploadedResult와 같은 방식.)
 * ⚠ 형제 함수와 같이 **원시 generation_tiers**를 읽는다. 한쪽만 result.bundle로 바꾸면
 * 두 판정이 서로 다른 소스를 보게 되어 더 어긋난다(정규화 통일은 v0.11.0).
 */
export function isAssembledResult(result) {
  return !!(result && result.reference_id == null && result.generation_tiers?.assembly)
}

/**
 * 대화형/자연어 수정 결과를 **확정해도 되는가**.
 *
 * `result-edit-parse`는 보통 부분 패치(applyEditPatch — 지정 키만 건드려 무손실)를 내지만,
 * `replace_flow`가 오면 LLM이 flow를 통째로 새로 낸 것이라 **업로드 봇의 미지 노드 설정이
 * 사라진다.** 업로드 봇·조립물에서는 그 경우만 막는다(대화형 수정 자체는 열어둔다).
 * 조립물도 업로드 봇에서 등록된 자산을 품을 수 있어 같은 위험이 있다.
 * @param {object|null|undefined} result
 * @param {'patch'|'regenerate'|string|null|undefined} mode
 */
export function canApplyDialogEdit(result, mode) {
  if (!isUploadedResult(result) && !isAssembledResult(result)) return { ok: true, reason: '' }
  if (mode === 'regenerate') {
    return {
      ok: false,
      reason: '전체 재생성은 올린 챗봇·조립물에 적용할 수 없습니다 — 이 도구가 모르는 노드의 설정이 사라집니다. 지시를 더 좁게 주시면 부분 수정으로 처리됩니다.',
    }
  }
  return { ok: true, reason: '' }
}

/**
 * 해당 질문에 사용자가 입력한 응답이 있는지 — 설문 빠른 수정에서 '응답 있는 항목 우선' 판정.
 * 문자열=공백 아님, 배열=빈 배열 아님, 객체=값 중 하나라도 채워짐. 나머지 truthy.
 * @param {{ id: string }} question
 * @param {Record<string, unknown>} answers
 * @returns {boolean}
 */
export function hasAnswer(question, answers) {
  if (!question || !answers) return false
  return isMeaningful(answers[question.id])
}

function isMeaningful(v) {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.values(v).some((x) => isMeaningful(x))
  return Boolean(v)
}

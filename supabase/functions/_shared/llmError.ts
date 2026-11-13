// LLM HTTP 오류 메시지 조립 (순수 모듈).
//
// ⚠ 왜 분리했나: dialogflow-generator/index.ts는 최상단에서 serve()를 부르므로 핸들러를 떼어낼
//    seam이 없다. 메시지 조립만이라도 순수 함수로 빼야 테스트가 붙는다.

/** 오류 본문에서 메시지에 담을 최대 길이. 넘으면 잘리고 말줄임이 붙는다. */
export const BODY_LIMIT = 300

// OpenAI 오류 본문이 키를 되돌려주지는 않지만, 만에 하나를 막는다.
const KEY_SHAPE = /sk-[A-Za-z0-9_-]{8,}/g

/**
 * 오류 본문에서 API 키 모양을 가린다.
 * ⚠ 마스킹 규칙은 여기 한 곳이다 — 오류 문자열을 만드는 자리마다 각자 정규식을 두면
 *    한 곳만 고쳐졌을 때 조용히 갈린다(이 저장소가 반복해 다친 모양).
 * @param text
 */
export function maskApiKeys(text: unknown): string {
  return String(text ?? '').replace(KEY_SHAPE, 'sk-***')
}

/**
 * LLM 호출이 HTTP 오류로 끝났을 때 던질 메시지를 만든다.
 * ⚠ 마스킹을 **자르기보다 먼저** 한다 — 순서를 뒤집으면 잘린 조각으로 키 앞부분이 샌다.
 * @param status HTTP 상태 코드
 * @param bodyText 응답 본문(텍스트)
 */
export function llmErrorMessage(status: number, bodyText: string): string {
  const masked = maskApiKeys(bodyText)
  const trimmed = masked.trim()
  if (trimmed === '') return `LLM 호출 실패 (HTTP ${status})`
  const body = trimmed.length > BODY_LIMIT ? trimmed.slice(0, BODY_LIMIT) + '…' : trimmed
  return `LLM 호출 실패 (HTTP ${status}): ${body}`
}

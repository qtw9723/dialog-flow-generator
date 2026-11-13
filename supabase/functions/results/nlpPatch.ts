// PATCH {nlp} 입력 검증 (순수 모듈). v0.11.0부터 esd_error·api_error도 같은 자리에서 함께 검증한다
// (설문 재생성 확정이 세 사유를 한 요청에 실어 보낸다 — 별도 분기를 만들면 한쪽이 조용히 버려진다).
//
// ⚠ 왜 분리했나: results/index.ts는 최상단에서 serve()를 부르므로 핸들러를 떼어낼 seam이 없다.
//    같은 이유로 archived.ts가 이미 분리돼 있다 — 그 모양을 따른다.
//
// null은 "지워라"를 뜻하고 undefined로 바꿔 돌려준다 — mergeBundle이 undefined를 키 삭제로
// 해석하는 기존 의미를 그대로 쓴다. esd_error·api_error 키를 아예 안 보내도(호출부가 안 넘기면)
// 마찬가지로 undefined가 되어 mergeBundle이 지운다 — 재생성이 깨끗하면 옛 사유가 남지 않는다.

export type NlpPatchResult =
  | { ok: true; nlp: unknown; nlpError: unknown; esdError: unknown; apiError: unknown }
  | { ok: false; error: string }

const isPlainObject = (v: unknown): boolean =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * @param body PATCH 본문
 */
export function validateNlpPatch(body: unknown): NlpPatchResult {
  if (!isPlainObject(body) || !("nlp" in (body as Record<string, unknown>))) {
    return { ok: false, error: "nlp가 필요합니다." }
  }
  const b = body as Record<string, unknown>
  const nlp = b.nlp
  if (nlp !== null && !isPlainObject(nlp)) {
    return { ok: false, error: "nlp는 객체이거나 null이어야 합니다." }
  }
  const rawError = b.nlp_error
  if (rawError !== undefined && rawError !== null && typeof rawError !== "string") {
    return { ok: false, error: "nlp_error는 문자열이어야 합니다." }
  }
  const rawEsdError = b.esd_error
  if (rawEsdError !== undefined && rawEsdError !== null && typeof rawEsdError !== "string") {
    return { ok: false, error: "esd_error는 문자열이어야 합니다." }
  }
  const rawApiError = b.api_error
  if (rawApiError !== undefined && rawApiError !== null && typeof rawApiError !== "string") {
    return { ok: false, error: "api_error는 문자열이어야 합니다." }
  }
  return {
    ok: true,
    nlp: nlp === null ? undefined : nlp,
    nlpError: rawError === null || rawError === undefined ? undefined : rawError,
    esdError: rawEsdError === null || rawEsdError === undefined ? undefined : rawEsdError,
    apiError: rawApiError === null || rawApiError === undefined ? undefined : rawApiError,
  }
}

// 긴 문서에 대한 사전 경고 (순수 모듈).
//
// ⚠ 막지 않고 경고만 한다. 임계값은 근사치이므로 오탐 비용을 낮게 유지한다.
//    잘린 **응답** 자체는 _shared/llmCall.ts의 finish_reason 검사가 잡는다.
// ⚠ 토크나이저를 프론트에 싣지 않는다 — 비용 대비 이득이 없다. 글자 수로 근사한다
//    (한글 기준 60,000자 ≈ 토큰 2만~2.5만).

export const LENGTH_WARN_THRESHOLD = 60000

/** 임계값을 넘으면 경고 문구, 아니면 null. */
export function lengthWarning(text: unknown): string | null {
  const n = String(text ?? '').length
  if (n <= LENGTH_WARN_THRESHOLD) return null
  return `문서가 깁니다(${n.toLocaleString('ko-KR')}자). 추출 결과가 일부 누락될 수 있습니다. 시나리오 단위로 나눠 올리면 정확도가 올라갑니다.`
}

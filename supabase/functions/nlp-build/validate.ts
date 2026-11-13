// 요청 검증만. serve() 밖에 두어 HTTP 없이 테스트한다.
export interface NlpBuildBody {
  step?: string
  description?: string
  intents?: Array<{ name?: string; examples?: string[] }>
}

/** 문제가 있으면 사용자에게 보여줄 메시지를, 없으면 null을 돌려준다. */
export function validateRequest(body: unknown): string | null {
  const b = (body && typeof body === "object" ? body : {}) as NlpBuildBody
  if (b.step !== "intents" && b.step !== "entities") {
    return "step은 'intents' 또는 'entities'만 지원합니다."
  }
  if (!String(b.description ?? "").trim()) {
    return "업무 설명이 필요합니다."
  }
  if (b.step === "entities") {
    if (!(Array.isArray(b.intents) && b.intents.length > 0)) {
      return "확정한 인텐트가 필요합니다."
    }
    // 이름이 빈 인텐트는 서버에서 조용히 버려진다 — 1개뿐이었다면 확정 인텐트 섹션이
    // 통째로 빈 채 LLM에 가고(v0.8.1 실패 모드) 사용자에겐 정상 결과로 보인다.
    if (b.intents.some((it) => !String(it?.name ?? "").trim())) {
      return "이름이 비어 있는 인텐트가 있습니다."
    }
  }
  return null
}

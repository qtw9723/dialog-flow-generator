// LLM 응답에서 kinds 배열을 파싱한다 (ingest-classify 전용).
//
// index.ts는 최상단에서 serve()를 부르므로 import만으로 서버가 뜬다(선례: _shared/resultPatch.ts).
// 테스트에서 import만 하려면 여기로 분리해야 한다.

export const VALID_KINDS = new Set(["esd", "api", "scenario", "ambiguous"])

export function parseKinds(raw: string, count: number): string[] {
  // ⚠ 실패를 "scenario"로 채우면 ESD·API 파일이 조용히 시나리오로 오분류된다(2026-09-28 실측).
  //    분류를 못 했으면 못 했다고 말한다 — 프론트가 ambiguous를 이미 다룬다.
  const unknown = () => Array(count).fill("ambiguous")
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return unknown()
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed) || parsed.length !== count) return unknown()
    return parsed.map((k) => (VALID_KINDS.has(k) ? k : "ambiguous"))
  } catch {
    return unknown()
  }
}

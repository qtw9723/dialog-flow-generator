// 시나리오명 → 인텐트명 변환의 엣지함수 진입점.
//
// ⚠ 규칙 본문(허용 문자 정규식)은 여기 없다 — `src/lib/nlp/intentName.js`가 유일 소스다.
// 프론트의 인텐트 귀속(`src/lib/assets/scenarioAssets.js`)이 같은 규칙으로 이름을 맞춰야
// 하는데 정규식이 두 벌이면 한쪽만 바뀌어 귀속이 조용히 어긋난다(이 저장소의 반복 실패 유형).
// 이 저장소는 이미 `src/lib/*.js`를 엣지함수에서 import한다(results·derive-assets 등 9곳).
import { intentNameOf } from "../../../src/lib/nlp/intentName.js"

export { intentNameOf }

/**
 * 시나리오명 목록을 인텐트명 목록으로 바꾼다. 인덱스는 1:1로 보존한다 —
 * 호출부가 i번째 시나리오와 i번째 인텐트를 짝지으므로 자리를 흐트러뜨리면 대응이 깨진다.
 * 중복은 뒤에 _2·_3을 붙인다(솔루션 인텐트명은 유일해야 한다).
 */
export function assignIntentNames(scenarioNames: string[]): string[] {
  const used = new Map<string, number>()
  return (scenarioNames || []).map((raw) => {
    const base = intentNameOf(raw)
    if (!base) return "" // 빈 이름은 그대로 — 버릴지는 호출부가 정한다.
    const seen = used.get(base) || 0
    used.set(base, seen + 1)
    return seen === 0 ? base : `${base}_${seen + 1}`
  })
}

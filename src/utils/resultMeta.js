// 결과 1건의 요약 메타(노드·시나리오·ESD·API·토큰·모델·봇 이름)를 계산.
// 목록 카드(ResultCard)와 상세 헤더(ResultDetail)가 동일한 수치를 쓰도록 공용화.

const PLACEHOLDER_NAMES = new Set(['name-from-mapping', 'generated-id', ''])

// 봇 표시 이름 — 플레이스홀더/빈값이면 '(이름 없음)'
export function resultBotName(result) {
  const name = result?.generated_json?.name
  return !PLACEHOLDER_NAMES.has(name) && name ? name : '(이름 없음)'
}

// 요약 수치 객체를 반환. 렌더 쪽에서 필요한 것만 골라 칩으로 표시.
export function resultMeta(result) {
  const json = result?.generated_json || {}
  const mainDialog = (json.dialogs || []).find((d) => d.id === 'main')
  const nodeCount = mainDialog?.nodes?.length || 0
  // 시나리오 수 = main의 루트(then) 중 greeting/fallback 제외 (ResultCard와 동일 규칙)
  const byId = new Map((mainDialog?.nodes || []).map((n) => [n.id, n]))
  const scenarioCount = (mainDialog?.then || [])
    .map((id) => byId.get(id))
    .filter((n) => n && n.type !== 'greeting' && n.type !== 'fallback').length
  const esdCount = result?.bundle?.esd_schemas?.length || 0
  const apiCount = result?.bundle?.api_defs?.length || 0
  const usage = result?.bundle?.usage || null
  return {
    nodeCount,
    scenarioCount,
    esdCount,
    apiCount,
    totalTokens: usage?.total_tokens || 0,
    model: usage?.model || '',
  }
}

// 칩 문자열 배열(값이 있는 것만). 목록 카드처럼 ' · '로 join해도 되고 개별 칩으로 써도 됨.
export function resultMetaChips(result) {
  const m = resultMeta(result)
  return [
    m.nodeCount ? `노드 ${m.nodeCount}개` : null,
    m.scenarioCount ? `시나리오 ${m.scenarioCount}개` : null,
    m.esdCount ? `ESD ${m.esdCount}개` : null,
    m.apiCount ? `API ${m.apiCount}개` : null,
    m.totalTokens ? `✨ ${m.totalTokens.toLocaleString()} 토큰` : null,
    m.model ? m.model : null,
  ].filter(Boolean)
}

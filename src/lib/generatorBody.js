// esd가 truthy일 때만 body에 포함(없으면 키 부재 보장).
export function injectEsd(body, esd) {
  if (!esd) return body
  return { ...body, esd }
}

// 블록 C: confirmed_mapping이 비어있지 않은 배열일 때만 body에 포함(없으면 키 부재 보장).
export function injectConfirmedMapping(body, confirmedMapping) {
  if (!Array.isArray(confirmedMapping) || confirmedMapping.length === 0) return body
  return { ...body, confirmed_mapping: confirmedMapping }
}

// proposeMapping 결과의 mappings와 사용자 selections으로 confirmed_mapping 페이로드를 빌드한다.
// selections: { [esdFieldName]: varName | null }
// 반환: [{esdField: string, varName: string | null}]
export function buildConfirmedMapping(mappings, selections) {
  if (!Array.isArray(mappings)) return []
  return mappings.map((m) => {
    const key = m.esdField?.name ?? ''
    const varName = Object.prototype.hasOwnProperty.call(selections, key) ? (selections[key] ?? null) : null
    return { esdField: key, varName }
  })
}

// generation_tiers → 정규화된 평면 번들 (순수).
//
// 소비처는 이 결과만 읽는다. 구 이름 폴백을 여기 한 곳에서 흡수하므로
// 화면 코드에 ?.폴백이 흩어지지 않는다.

import { BUNDLE_CONTRACT, CANONICAL_KEYS } from './contract.js'

/**
 * @param {object|null|undefined} tiers - 결과 행의 generation_tiers(jsonb)
 * @returns {object} 계약의 모든 캐노니컬 키 + 계약 밖 키(원본 보존)
 */
export function readBundle(tiers) {
  const src = tiers && typeof tiers === 'object' && !Array.isArray(tiers) ? tiers : {}
  const out = { ...src }   // 계약 밖 키 보존(미래 생산처 대비)

  for (const key of CANONICAL_KEYS) {
    const spec = BUNDLE_CONTRACT[key]
    if (src[key] !== undefined) { out[key] = src[key]; continue }

    let found
    for (const old of spec.legacy || []) {
      if (src[old] !== undefined) { found = src[old]; break }
    }
    out[key] = found !== undefined ? found : spec.default
  }
  return out
}

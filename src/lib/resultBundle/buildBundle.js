// 번들 쓰기 조립 (순수).
//
// 생산처는 이걸 거쳐 쓴다. 계약에 없는 키를 넣으면 던지므로 "키가 조용히 자라는" 일이 막힌다.
// 사용자 입력이 아니라 코드가 정한 키만 지나가므로, 이 예외는 개발 시점에만 난다.
// 그럼에도 생성 경로가 죽지 않도록 호출 측(dialogflow-generator)이 try/catch로 감싼다.

import { CANONICAL_KEYS, PROFILE_REQUIRED } from './contract.js'

function assertDeclared(keys, where) {
  const unknown = keys.filter((k) => !CANONICAL_KEYS.includes(k))
  if (unknown.length) {
    throw new Error(
      `[bundle] 계약에 없는 키: ${unknown.join(', ')} (${where}). ` +
      `src/lib/resultBundle/contract.js에 선언하고 등급을 정하라.`,
    )
  }
}

/**
 * @param {'generated'|'upload'|'assembled'} profile
 * @param {object} values 캐노니컬 키 → 값. undefined인 키는 빠진다.
 * @returns {object} generation_tiers에 넣을 객체
 */
export function buildBundle(profile, values) {
  const required = PROFILE_REQUIRED[profile]
  if (!required) throw new Error(`[bundle] 모르는 프로파일: ${profile}`)

  const given = Object.entries(values || {}).filter(([, v]) => v !== undefined)
  assertDeclared(given.map(([k]) => k), `profile=${profile}`)

  const out = Object.fromEntries(given)
  const missing = required.filter((k) => out[k] === undefined)
  if (missing.length) {
    throw new Error(`[bundle] ${profile} 프로파일의 필수 키 누락: ${missing.join(', ')}`)
  }
  return out
}

/**
 * 기존 번들에 부분 갱신을 얹는다. patch의 undefined는 삭제.
 * 기존 번들의 계약 밖 키(옛 행의 레거시 키)는 건드리지 않는다.
 * @param {object|null|undefined} existing
 * @param {object} patch
 */
export function mergeBundle(existing, patch) {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {}
  assertDeclared(Object.keys(patch || {}), 'mergeBundle')

  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) delete base[k]
    else base[k] = v
  }
  return base
}

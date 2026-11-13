// 결과 신뢰 상태 (순수) — v0.16.0 항목 2.
//
// 생성 결과는 정적 검사를 통과해도 솔루션에서 돌려 보기 전에는 완성품이 아니다. 그래서 기본은
// 'draft'(미검증 초안)이고, 사용자가 솔루션에서 확인한 뒤 직접 표시해야만 'verified'가 된다.
// 자동으로 verified로 올리는 경로는 없다(V2 Craft의 provisional 원칙).
//
// 표시할 때 그 시점 흐름의 지문을 함께 저장한다. 이후 편집·되돌리기로 흐름이 바뀌면 지문이 어긋나
// 'stale'(검증 후 수정됨)이 된다 — 편집 경로마다 검증 해제를 끼워 넣지 않아도 된다.
// 지문은 crypto.subtle을 쓰지 않는다: LAN IP(http)로 접속하면 보안 컨텍스트가 아니라 없다.

import { isUploadedResult } from '../resultEditGating.js'

/** 키를 정렬한 JSON — jsonb가 키 순서를 바꿔 저장해도 같은 지문이 나오게. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** cyrb53 — 충돌 방지용이 아니라 "바뀌었나" 판정용 53비트 해시. */
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export function flowFingerprint(flow) {
  return cyrb53(canonical(flow))
}

/** PATCH {verified:true}가 저장할 값. */
export function buildVerification(flow, at = new Date().toISOString()) {
  return { status: 'verified', at, flow_hash: flowFingerprint(flow) }
}

/**
 * @returns {'none'|'draft'|'verified'|'stale'}
 *   none: 업로드한 기존 봇(이미 운영 중인 봇이라 대상 아님)
 */
export function verificationStatus(result) {
  if (!result || isUploadedResult(result)) return 'none'
  const v = result.bundle?.verification
  if (v?.status !== 'verified') return 'draft'
  return v.flow_hash === flowFingerprint(result.generated_json) ? 'verified' : 'stale'
}

export const VERIFICATION_LABELS = {
  draft: '미검증 초안',
  stale: '미검증 초안 (검증 후 수정됨)',
  verified: '솔루션 검증 완료',
}

/** PATCH 요청 검증 — 문제가 있으면 메시지, 없으면 null. */
export function validateVerified(body) {
  const b = body && typeof body === 'object' ? body : {}
  if (typeof b.verified !== 'boolean') return 'verified must be a boolean'
  return null
}

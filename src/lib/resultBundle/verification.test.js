import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { flowFingerprint, verificationStatus, buildVerification, validateVerified } from "./verification.js"

const FLOW = { name: '봇', dialogs: [{ id: 'main', then: ['a'], nodes: [{ id: 'a', type: 'output', then: [] }] }] }
const gen = (extra = {}) => ({ id: 'r1', reference_id: 'ref', generated_json: FLOW, generation_tiers: {}, bundle: {}, ...extra })

Deno.test("flowFingerprint: 키 순서가 달라도 같은 지문(jsonb 정규화 대비)", () => {
  const a = { x: 1, y: { b: 2, a: [1, { d: 1, c: 2 }] } }
  const b = { y: { a: [1, { c: 2, d: 1 }], b: 2 }, x: 1 }
  assertEquals(flowFingerprint(a), flowFingerprint(b))
})

Deno.test("flowFingerprint: 내용이 바뀌면 지문이 바뀐다(배열 순서 포함)", () => {
  assertNotEquals(flowFingerprint({ then: ['a', 'b'] }), flowFingerprint({ then: ['b', 'a'] }))
  assertNotEquals(flowFingerprint({ t: '안녕' }), flowFingerprint({ t: '안녕!' }))
})

Deno.test("verificationStatus: 표시 없으면 미검증 초안", () => {
  assertEquals(verificationStatus(gen()), 'draft')
})

Deno.test("verificationStatus: 검증 표시 + 지문 일치면 verified", () => {
  const v = buildVerification(FLOW, '2026-10-26T00:00:00Z')
  assertEquals(verificationStatus(gen({ bundle: { verification: v } })), 'verified')
})

Deno.test("verificationStatus: 검증 뒤 흐름이 바뀌면 stale", () => {
  const v = buildVerification(FLOW, '2026-10-26T00:00:00Z')
  const edited = { ...FLOW, name: '바뀐 봇' }
  assertEquals(verificationStatus(gen({ generated_json: edited, bundle: { verification: v } })), 'stale')
})

Deno.test("verificationStatus: 업로드 봇은 대상 아님(none)", () => {
  assertEquals(verificationStatus({ reference_id: null, generation_tiers: { upload: { file: 'x' } }, bundle: {} }), 'none')
})

Deno.test("validateVerified: boolean만 허용", () => {
  assertEquals(validateVerified({ verified: true }), null)
  assertEquals(validateVerified({ verified: false }), null)
  assertEquals(typeof validateVerified({ verified: 'yes' }), 'string')
  assertEquals(typeof validateVerified(null), 'string')
})

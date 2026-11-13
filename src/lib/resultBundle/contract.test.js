import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  BUNDLE_CONTRACT, PROFILE_REQUIRED, CANONICAL_KEYS, LEGACY_TO_CANONICAL, DROPPED_KEYS,
} from './contract.js'

Deno.test('등급은 셋 중 하나다', () => {
  for (const [k, v] of Object.entries(BUNDLE_CONTRACT)) {
    assert(['required', 'optional', 'observability'].includes(v.tier), `${k}: ${v.tier}`)
  }
})

Deno.test('모든 키에 설명이 있다', () => {
  for (const [k, v] of Object.entries(BUNDLE_CONTRACT)) {
    assert(typeof v.desc === 'string' && v.desc.length > 0, `${k}에 desc 없음`)
  }
})

Deno.test('legacy 이름은 캐노니컬 키와 겹치지 않는다', () => {
  // LEGACY_TO_CANONICAL의 엔트리는 [구 이름, 새 이름] 순서다.
  for (const [oldName, canonical] of Object.entries(LEGACY_TO_CANONICAL)) {
    assert(!CANONICAL_KEYS.includes(oldName), `${oldName}은 캐노니컬이면서 legacy다 (→${canonical})`)
  }
})

Deno.test('legacy 이름이 두 캐노니컬 키에 중복 매핑되지 않는다', () => {
  const seen = new Set()
  for (const [k, v] of Object.entries(BUNDLE_CONTRACT)) {
    for (const old of v.legacy || []) {
      assert(!seen.has(old), `${old}이 중복 매핑됨 (${k})`)
      seen.add(old)
    }
  }
})

Deno.test('버리는 개수 키는 legacy로 매핑되지 않는다 — 타입이 다르다', () => {
  for (const dropped of DROPPED_KEYS) {
    assertEquals(LEGACY_TO_CANONICAL[dropped], undefined, `${dropped}이 폴백으로 남아 있다`)
  }
  assertEquals(
    [...DROPPED_KEYS].sort(),
    ['stage377_else_order_moved', 'tier3_rules_executed', 'tier3_rules_skipped'],
  )
})

Deno.test('프로파일 required는 계약에 선언된 키만 쓴다', () => {
  for (const [profile, keys] of Object.entries(PROFILE_REQUIRED)) {
    for (const k of keys) assert(CANONICAL_KEYS.includes(k), `${profile}의 ${k}가 계약에 없음`)
  }
})

Deno.test('nlp_error: 화면이 읽으므로 optional 등급이고 기본값은 null', () => {
  assertEquals(BUNDLE_CONTRACT.nlp_error.tier, 'optional')
  assertEquals(BUNDLE_CONTRACT.nlp_error.default, null)
})

Deno.test('nlp_error: 설명에서 "예정"이 빠졌다 — v0.11.0에서 실제로 노출했다', () => {
  assertEquals(BUNDLE_CONTRACT.nlp_error.desc.includes('예정'), false)
})

Deno.test('업로드 프로파일은 created_by를 요구하지 않는다 (익명 업로드 가능)', () => {
  assertEquals(PROFILE_REQUIRED.upload, ['upload'])
  assert(PROFILE_REQUIRED.generated.includes('created_by'))
})

Deno.test('소비처가 읽는 13키가 모두 계약에 있다', () => {
  const consumed = ['esd', 'upload', 'edit_history', 'created_by', 'scenarios', 'esd_schemas',
    'esd_mapping', 'api_defs', 'usage', 'source', 'nlp', 'validation', 'confirmed_mapping']
  for (const k of consumed) assert(CANONICAL_KEYS.includes(k), `${k}가 계약에 없음`)
})

Deno.test('archived는 optional이고 기본값이 false다', () => {
  assertEquals(BUNDLE_CONTRACT.archived.tier, 'optional')
  assertEquals(BUNDLE_CONTRACT.archived.default, false)
})

Deno.test('assembly는 optional이고 기본값이 null이다', () => {
  assertEquals(BUNDLE_CONTRACT.assembly.tier, 'optional')
  assertEquals(BUNDLE_CONTRACT.assembly.default, null)
})

Deno.test('assembled 프로파일은 assembly만 요구한다', () => {
  assertEquals(PROFILE_REQUIRED.assembled, ['assembly'])
})

Deno.test('esd_error·api_error: 화면이 읽으므로 optional 등급이고 기본값은 null', () => {
  for (const k of ['esd_error', 'api_error']) {
    assertEquals(BUNDLE_CONTRACT[k].tier, 'optional')
    assertEquals(BUNDLE_CONTRACT[k].default, null)
  }
})

Deno.test('파생 실패 키 셋이 같은 등급·기본값을 쓴다 — 하나만 달라지면 화면이 갈린다', () => {
  const keys = ['nlp_error', 'esd_error', 'api_error']
  const tiers = keys.map((k) => BUNDLE_CONTRACT[k].tier)
  const defaults = keys.map((k) => BUNDLE_CONTRACT[k].default)
  assertEquals(new Set(tiers).size, 1)
  assertEquals(new Set(defaults).size, 1)
})

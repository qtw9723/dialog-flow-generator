import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildUploadRow, isUploadedResult } from './buildUploadRow.js'

const json = { id: 'b', name: '레스토랑봇', dialogs: [{ id: 'main', then: [], nodes: [] }] }

Deno.test('NOT NULL 컬럼을 반드시 채운다', () => {
  const row = buildUploadRow(json)
  assertEquals(row.generated_json, json)
  assertEquals(row.responses, {})           // NOT NULL
  assertEquals(row.reference_id, null)      // nullable — 업로드 표식
})

Deno.test('generated_json은 입력 객체를 그대로 실어야 한다(재직렬화 금지)', () => {
  const row = buildUploadRow(json)
  assertEquals(row.generated_json === json, true, '동일 참조여야 한다')
})

Deno.test('upload 번들에 검사 결과를 담는다', () => {
  const row = buildUploadRow(json, {
    sha256: 'abc', fileName: 'bot.json', uploadedAt: '2026-08-28T00:00:00Z',
    info: { nodeCount: 145, scenarioCount: 13, lockedCount: 24, unknownTypes: ['zzz'], hasControls: true },
  })
  const u = row.generation_tiers.upload
  assertEquals(u.original_sha256, 'abc')
  assertEquals(u.file_name, 'bot.json')
  assertEquals(u.node_count, 145)
  assertEquals(u.locked_count, 24)
  assertEquals(u.unknown_types, ['zzz'])
  assertEquals(u.has_controls, true)
  assertEquals(u.bot_name, '레스토랑봇')
})

Deno.test('이름은 meta.name 우선, 없으면 json.name', () => {
  assertEquals(buildUploadRow(json, { name: '직접입력' }).generation_tiers.upload.bot_name, '직접입력')
  assertEquals(buildUploadRow(json).generation_tiers.upload.bot_name, '레스토랑봇')
  assertEquals(buildUploadRow({ dialogs: [] }).generation_tiers.upload.bot_name, '')
})

Deno.test('소유자 정보는 있을 때만 넣는다', () => {
  assertEquals('user_id' in buildUploadRow(json), false)
  assertEquals(buildUploadRow(json, { ownerUserId: 'u1' }).user_id, 'u1')
  assertEquals(buildUploadRow(json, { createdBy: 'a@b.c' }).generation_tiers.created_by, 'a@b.c')
})

Deno.test('isUploadedResult: 업로드본만 true', () => {
  assertEquals(isUploadedResult({ reference_id: null, generation_tiers: { upload: {} } }), true)
  assertEquals(isUploadedResult({ reference_id: 'r1', generation_tiers: { upload: {} } }), false)
  assertEquals(isUploadedResult({ reference_id: null, generation_tiers: {} }), false)
  assertEquals(isUploadedResult({ reference_id: null }), false)
  assertEquals(isUploadedResult(null), false)
  assertEquals(isUploadedResult(undefined), false)
})

Deno.test('isUploadedResult: reference_id가 undefined여도 업로드본으로 본다', () => {
  assertEquals(isUploadedResult({ generation_tiers: { upload: {} } }), true)
})

// ── v0.10.0 번들 계약 ────────────────────────────────────────────────
import { CANONICAL_KEYS } from '../resultBundle/contract.js'

Deno.test('업로드 행의 번들 키는 전부 계약에 있다', () => {
  const row = buildUploadRow(json, { createdBy: 'a@b.com' })
  for (const k of Object.keys(row.generation_tiers)) {
    assertEquals(CANONICAL_KEYS.includes(k), true, `${k}가 계약에 없다`)
  }
})

Deno.test('createdBy가 없으면 created_by 키 자체가 없다 (익명 업로드)', () => {
  const row = buildUploadRow(json)
  assertEquals('created_by' in row.generation_tiers, false)
  assertEquals(!!row.generation_tiers.upload, true)
})

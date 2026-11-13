import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  ARCHIVE_MODES, ARCHIVE_MODE_LABELS, isArchived, filterByArchive,
  normalizeArchiveMode, archiveErrorMessage,
} from './archiveFilter.js'

const A = { id: 'a', bundle: { archived: true } }
const B = { id: 'b', bundle: { archived: false } }
const C = { id: 'c', bundle: {} }          // 키 없는 옛 행
const D = { id: 'd' }                       // bundle 자체가 없는 방어 케이스

Deno.test('isArchived: true인 것만 보관이다', () => {
  assertEquals(isArchived(A), true)
  assertEquals(isArchived(B), false)
  assertEquals(isArchived(C), false)
  assertEquals(isArchived(D), false)
  assertEquals(isArchived(null), false)
})

Deno.test('filterByArchive: all은 전부 남긴다', () => {
  assertEquals(filterByArchive([A, B, C], 'all').map((r) => r.id), ['a', 'b', 'c'])
})

Deno.test('filterByArchive: archived는 보관만', () => {
  assertEquals(filterByArchive([A, B, C], 'archived').map((r) => r.id), ['a'])
})

Deno.test('filterByArchive: unarchived는 키 없는 옛 행도 포함한다', () => {
  assertEquals(filterByArchive([A, B, C], 'unarchived').map((r) => r.id), ['b', 'c'])
})

// localStorage에 옛 값이 남아 있어도 목록이 비어 보이면 안 된다.
Deno.test('filterByArchive: 모르는 모드는 all로 취급한다', () => {
  assertEquals(filterByArchive([A, B, C], '뭔가이상한값').map((r) => r.id), ['a', 'b', 'c'])
  assertEquals(filterByArchive([A, B, C], undefined).map((r) => r.id), ['a', 'b', 'c'])
})

Deno.test('filterByArchive: 배열이 아니면 빈 배열', () => {
  assertEquals(filterByArchive(null, 'all'), [])
  assertEquals(filterByArchive(undefined, 'archived'), [])
})

Deno.test('모드 목록과 라벨이 짝이 맞는다', () => {
  assertEquals(ARCHIVE_MODES, ['all', 'archived', 'unarchived'])
  for (const m of ARCHIVE_MODES) {
    assertEquals(typeof ARCHIVE_MODE_LABELS[m], 'string')
  }
})

Deno.test('normalizeArchiveMode: 알려진 모드는 그대로 통과', () => {
  assertEquals(normalizeArchiveMode('all'), 'all')
  assertEquals(normalizeArchiveMode('archived'), 'archived')
  assertEquals(normalizeArchiveMode('unarchived'), 'unarchived')
})

Deno.test('normalizeArchiveMode: 모르는 값·손상값은 all로 떨어진다', () => {
  assertEquals(normalizeArchiveMode('뭔가이상한값'), 'all')
  assertEquals(normalizeArchiveMode(undefined), 'all')
  assertEquals(normalizeArchiveMode(null), 'all')
  assertEquals(normalizeArchiveMode(''), 'all')
})

Deno.test('archiveErrorMessage: 목록 경로 401(Unauthorized)은 한국어 안내로 바뀐다', () => {
  assertEquals(
    archiveErrorMessage(new Error('Unauthorized')),
    '본인이 만든 결과만 보관 표시할 수 있습니다.',
  )
})

Deno.test('archiveErrorMessage: 상세 경로 admin-results 폴백 400도 같은 한국어 안내로 바뀐다', () => {
  assertEquals(
    archiveErrorMessage(new Error('esd, or generated_json+edit_entry, or undo:true fields are required')),
    '본인이 만든 결과만 보관 표시할 수 있습니다.',
  )
})

Deno.test('archiveErrorMessage: 그 밖의 오류는 서버 원문을 그대로 보여준다', () => {
  assertEquals(archiveErrorMessage(new Error('archived must be a boolean')), 'archived must be a boolean')
  assertEquals(archiveErrorMessage('그냥 문자열 오류'), '그냥 문자열 오류')
})

Deno.test('archiveErrorMessage: null·undefined·문자열 아닌 값도 죽지 않고 일반 문구로 대체', () => {
  assertEquals(archiveErrorMessage(null), '보관 표시를 바꾸지 못했습니다.')
  assertEquals(archiveErrorMessage(undefined), '보관 표시를 바꾸지 못했습니다.')
  assertEquals(archiveErrorMessage(42), '보관 표시를 바꾸지 못했습니다.')
  assertEquals(archiveErrorMessage({}), '보관 표시를 바꾸지 못했습니다.')
  assertEquals(archiveErrorMessage({ message: 123 }), '보관 표시를 바꾸지 못했습니다.')
})

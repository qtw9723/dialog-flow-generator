// 결과 행에 정규화된 번들을 덧붙인다 (순수).
//
// 읽기 경계(결과가 앱으로 들어오는 지점)에서 딱 한 번 부른다.
// 원본 generation_tiers는 건드리지 않는다 — PATCH 병합과 왕복 무손실이 원본을 쓴다.

import { readBundle } from './readBundle.js'

/** @param {object|null|undefined} row 결과 행 @returns {object|null|undefined} */
export function normalizeResult(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  return { ...row, bundle: readBundle(row.generation_tiers) }
}

/** 목록 응답용. 배열이 아니면 그대로 통과시킨다(에러 객체 등). */
export function normalizeResults(rows) {
  return Array.isArray(rows) ? rows.map(normalizeResult) : rows
}

// 솔루션 NLP 업로드 CSV 규격 상수 (순수 모듈, UI·파싱 라이브러리 무의존).
//
// 값은 사용자 제공 샘플을 바이트 단위로 실측한 것이다
// (docs/superpowers/fixtures/sample-intents.csv, sample-entities.csv).
// ⚠ ESD 업로드 CSV(src/lib/uploadCsvRules.js)는 BOM 없음이 사양이라 규격이 반대다.
//    상수를 공유하지 마라 — 한쪽을 고치면 다른 쪽이 깨진다.

export const BOM = '﻿'
export const DELIMITER = ','
export const LINE_ENDING = '\n'

// 엔티티 CSV는 컬럼 수가 고정이다(샘플 13칸). 동의어가 적으면 빈칸으로 채우고, 많으면 잘린다.
export const ENTITY_COLUMN_COUNT = 13

export const INTENT_HEADER = ['intent', 'example']
export const ENTITY_HEADER_NAMED = ['entity', 'value', 'type', 'synonyms']

/**
 * 값을 CSV 셀로 직렬화한다. 샘플은 빈 칸을 제외한 **모든 셀을 인용**하므로 무조건 감싼다.
 * @param {*} value
 * @returns {string} 항상 `"`로 감싼 문자열
 */
export function quoteCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * 셀 배열을 고정 폭에 맞춘다. 부족하면 빈 문자열로 채우고, 넘치면 잘라낸다.
 * 잘림은 호출부가 사용자에게 알려야 한다(조용한 손실 금지) — toNlpCsv가 담당.
 * @param {string[]} cells
 * @param {number} width
 * @returns {string[]}
 */
export function padRow(cells, width) {
  const out = cells.slice(0, width)
  while (out.length < width) out.push('')
  return out
}

// generation_tiers.nlp 번들 → 솔루션 업로드용 CSV 문자열 (순수).
//
// 엣지함수는 번들만 저장하고 CSV는 여기서 만든다 — 규격이 바뀌어도 봇을 다시 생성할 필요가
// 없고 다운로드만 다시 하면 된다.
import {
  BOM, DELIMITER, LINE_ENDING, ENTITY_COLUMN_COUNT,
  INTENT_HEADER, ENTITY_HEADER_NAMED, quoteCell, padRow,
} from './nlpCsvRules.js'

const row = (cells) => cells.join(DELIMITER)

// 헤더의 빈 칸은 샘플에서 인용되지 않는다: `"entity","value","type","synonyms",,,,,,,,,`
const headerRow = (named, width) => {
  const quoted = named.map(quoteCell)
  while (quoted.length < width) quoted.push('')
  return row(quoted)
}

/**
 * @param {{intents?: Array<{name: string, examples?: string[]}>}} bundle
 * @returns {string} BOM + 헤더 + 인텐트×어터런스 행
 */
export function toIntentsCsv(bundle) {
  const lines = [row(INTENT_HEADER.map(quoteCell))]
  for (const it of (bundle?.intents || [])) {
    const name = String(it?.name || '').trim()
    if (!name) continue
    for (const ex of (it?.examples || [])) {
      const e = String(ex || '').trim()
      if (e) lines.push(row([quoteCell(name), quoteCell(e)]))
    }
  }
  return BOM + lines.join(LINE_ENDING)
}

/**
 * @param {{entities?: Array<{name: string, type?: string, values?: Array<{value: string, synonyms?: string[]}>}>}} bundle
 * @returns {{csv: string, truncated: Array<{entity: string, value: string, dropped: number}>}}
 *   truncated: 13컬럼을 넘겨 잘린 동의어 보고. 화면이 사용자에게 알려야 한다.
 */
export function toEntitiesCsv(bundle) {
  const lines = [headerRow(ENTITY_HEADER_NAMED, ENTITY_COLUMN_COUNT)]
  const truncated = []
  for (const ent of (bundle?.entities || [])) {
    const name = String(ent?.name || '').trim()
    if (!name) continue
    const type = String(ent?.type || 'synonyms').trim() || 'synonyms'
    for (const v of (ent?.values || [])) {
      const value = String(v?.value || '').trim()
      if (!value) continue
      const syns = (v?.synonyms || []).map((s) => String(s || '').trim()).filter(Boolean)
      const cells = [name, value, type, ...syns]
      const dropped = Math.max(0, cells.length - ENTITY_COLUMN_COUNT)
      if (dropped > 0) truncated.push({ entity: name, value, dropped })
      lines.push(row(padRow(cells, ENTITY_COLUMN_COUNT).map((c, i) =>
        // 잘린 뒤 남은 빈 칸은 샘플처럼 인용하지 않는다.
        i < cells.length && cells[i] !== undefined ? quoteCell(cells[i]) : '')))
    }
  }
  return { csv: BOM + lines.join(LINE_ENDING), truncated }
}

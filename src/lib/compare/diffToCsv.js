// 차이 목록 → 내보내기 CSV (순수 모듈).
//
// 이 파일은 **솔루션 업로드용이 아니라 사람이 엑셀에서 여는 파일**이다. 그래도 요구는
// NLP CSV와 같다(엑셀에서 한글이 깨지지 않으려면 BOM이 필요하다) — 그래서 그 규격 상수를
// 그대로 쓴다. ⚠ ESD 규격(uploadCsvRules.js)은 BOM 없음이라 반대이므로 쓰면 안 된다.
// 첫 글자가 BOM인지 테스트가 고정하고 있으므로, 규격이 바뀌면 조용히가 아니라 빨갛게 깨진다.
import { BOM, DELIMITER, LINE_ENDING, quoteCell } from '../nlp/nlpCsvRules.js'
import { readableKey } from './diffRows.js'

export const DIFF_CSV_HEADER = ['구분', '키', '컬럼', '이전', '이후']

/**
 * 행 전체를 한 칸에 담을 때 쓰는 이음새.
 * ⚠ DiffTable.jsx의 화면 표시도 **같은 값**을 써야 한다 — 각자 들고 있으면
 *    한쪽만 고쳤을 때 화면과 내보내기가 조용히 갈린다.
 */
export const ROW_JOIN = ' | '
/** 집합을 한 칸에 담을 때 쓰는 이음새. */
const SET_JOIN = ', '
/** 행 전체를 가리키는 컬럼 이름. */
const WHOLE_ROW = '(행 전체)'

const FILENAME_KIND = {
  intents: '인텐트',
  entities: '엔티티',
  esd: 'ESD',
  unknown: 'CSV',
}

const line = (cells) => cells.map(quoteCell).join(DELIMITER)

/**
 * 차이 하나가 출력 한 행이다.
 * 집합 변경은 추가·삭제분이 아니라 **집합 전체**를 낸다 — 받는 쪽이 엑셀이라
 * 무엇이 바뀌었는지보다 바뀐 뒤 최종 모습이 붙여 쓰기 좋다(추가·삭제분은 화면에서 본다).
 * @param {{added: Array, removed: Array, changed: Array}} diff
 * @returns {string}
 */
export function diffToCsv(diff) {
  const out = [line(DIFF_CSV_HEADER)]

  for (const e of diff.added ?? []) {
    out.push(line(['추가', readableKey(e.key), WHOLE_ROW, '', (e.row ?? []).join(ROW_JOIN)]))
  }
  for (const e of diff.removed ?? []) {
    out.push(line(['삭제', readableKey(e.key), WHOLE_ROW, (e.row ?? []).join(ROW_JOIN), '']))
  }
  for (const e of diff.changed ?? []) {
    const key = readableKey(e.key)
    for (const c of e.cells ?? []) {
      out.push(line(['변경', key, c.header, c.before, c.after]))
    }
    for (const s of e.sets ?? []) {
      out.push(line(['변경', key, s.header, (s.beforeAll ?? []).join(SET_JOIN), (s.afterAll ?? []).join(SET_JOIN)]))
    }
  }

  return BOM + out.join(LINE_ENDING) + LINE_ENDING
}

/**
 * 내려받을 파일명. 예: `비교-인텐트-20260914.csv`
 * @param {string} kind detectCsvKind의 kind
 * @param {Date} [date]
 * @returns {string}
 */
export function diffCsvFilename(kind, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
  return `비교-${FILENAME_KIND[kind] ?? FILENAME_KIND.unknown}-${stamp}.csv`
}

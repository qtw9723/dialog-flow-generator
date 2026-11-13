// CSV 파서 (순수 모듈) — 우리 규격 CSV를 **원문 그대로** 읽는다.
//
// ⚠ src/lib/parseExcelFile.js·normalizeSheet.js를 쓰지 않는다. 저쪽은 "지저분한 실무 엑셀을
//    살려내는" 목적이라 빈 열 제거·셀 트림·헤더 행 추정을 하는데, 비교 도구에서는 전부 해롭다.
//    특히 엔티티 CSV는 동의어가 4번째 열부터 위치로 들어가는 13칸 고정 규격이라, 빈 열을
//    지우면 파일마다 컬럼 수가 달라져 비교 자체가 어긋난다. 설계 스펙 참조.
//
// 행은 객체가 아니라 string[]로 돌려준다 — 엔티티 CSV는 빈 이름 헤더가 9개라
// Record<헤더, 값>으로 만들면 없는 이름을 지어내야 한다.

const BOM = '﻿'
const CANDIDATE_DELIMITERS = [',', '\t', ';']
const DEFAULT_DELIMITER = ','
const SAMPLE_LINES = 5

/**
 * CRLF·CR을 LF로 접고 **맨 앞** BOM 한 글자를 없앤다.
 * 중간의 U+FEFF는 값의 일부일 수 있으므로 건드리지 않는다.
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  const s = String(text ?? '').replace(/\r\n?/g, '\n')
  return s.startsWith(BOM) ? s.slice(1) : s
}

/**
 * 구분자를 추정한다 — 앞 5줄에서 **따옴표 밖**에 나온 후보 글자를 센다.
 * 따옴표 안을 세면 값에 탭이 든 쉼표 CSV가 탭 CSV로 오판돼 전체가 한 칸이 된다.
 * 후보가 하나도 없으면 쉼표(우리 CSV 3종은 모두 쉼표라 실질은 탭 CSV 대비 안전장치다).
 * @param {string} normalized normalizeText를 거친 문자열
 * @returns {string}
 */
export function detectDelimiter(normalized) {
  const counts = new Map(CANDIDATE_DELIMITERS.map((d) => [d, 0]))
  let inQuotes = false
  let lines = 0
  for (let i = 0; i < normalized.length && lines < SAMPLE_LINES; i++) {
    const ch = normalized[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (inQuotes) continue
    if (ch === '\n') { lines++; continue }
    if (counts.has(ch)) counts.set(ch, counts.get(ch) + 1)
  }
  let best = DEFAULT_DELIMITER
  for (const [d, n] of counts) if (n > counts.get(best)) best = d
  return counts.get(best) > 0 ? best : DEFAULT_DELIMITER
}

/**
 * RFC4180 CSV를 파싱한다. 1행은 **항상** 헤더다(헤더 유무를 추정하지 않는다 —
 * 잘못 맞히면 한 행이 조용히 사라진다).
 * 던지지 않는다. 문제는 warnings로 돌려준다 — 사용자가 어디를 고쳐야 하는지 알아야 한다.
 * @param {string} text
 * @param {{ delimiter?: string }} [options]
 * @returns {{ headers: string[], rows: string[][], delimiter: string, warnings: string[] }}
 */
export function parseCsv(text, options = {}) {
  const warnings = []
  const normalized = normalizeText(text)
  const delimiter = options.delimiter ?? detectDelimiter(normalized)

  const records = []
  let field = ''
  let record = []
  let inQuotes = false
  let quoteOpenedAtLine = 1
  let line = 1
  // 현재 레코드가 시작한 물리 줄 번호. 빈 줄 필터·따옴표 안 개행을 거쳐도
  // 긴 행 경고가 idx 기반이 아니라 실제 줄 번호를 가리키려면 레코드마다 따라다녀야 한다.
  let recordStartLine = 1

  const endField = () => { record.push(field); field = '' }
  const endRecord = () => {
    endField()
    records.push({ fields: record, startLine: recordStartLine })
    record = []
  }

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') { inQuotes = true; quoteOpenedAtLine = line; continue }
    if (ch === delimiter) { endField(); continue }
    if (ch === '\n') { endRecord(); line++; recordStartLine = line; continue }
    field += ch
  }
  if (inQuotes) {
    warnings.push(`${quoteOpenedAtLine}행에서 시작한 따옴표가 닫히지 않았습니다 — 그 뒤를 한 값으로 읽었습니다.`)
  }
  // 마지막 레코드. 파일 끝 개행은 이미 endRecord를 불렀으므로 빈 레코드를 만들지 않는다.
  if (field !== '' || record.length > 0) endRecord()

  // 빈 줄(필드 하나이고 그게 빈 문자열)은 유령 행이므로 버린다.
  // ⚠ ",,"처럼 **여러 개의** 빈 칸인 행은 데이터이므로 살린다.
  const kept = records.filter((r) => !(r.fields.length === 1 && r.fields[0] === ''))
  if (kept.length === 0) return { headers: [], rows: [], delimiter, warnings }

  const headers = kept[0].fields
  const rows = kept.slice(1).map((r) => {
    const fields = r.fields
    if (fields.length > headers.length) {
      warnings.push(`${r.startLine}행이 헤더보다 깁니다(${fields.length}칸 > ${headers.length}칸) — 넘치는 칸은 비교에서 빠집니다.`)
      return fields
    }
    if (fields.length < headers.length) return [...fields, ...Array(headers.length - fields.length).fill('')]
    return fields
  })
  return { headers, rows, delimiter, warnings }
}

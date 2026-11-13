import { routeApiDoc } from '../apiDoc/routeApiDoc.js'

const ESD_EXTENSIONS = new Set(['xlsx', 'xls', 'csv'])
const SCENARIO_EXTENSIONS = new Set(['pdf', 'md', 'txt', 'docx'])

/**
 * 파일 이름과 추출된 텍스트 내용으로 파일 종류를 판정한다.
 * @param {string} name - 파일명(확장자 포함)
 * @param {string} textContent - 파일에서 추출된 텍스트
 * @returns {{ kind: 'esd'|'api'|'scenario'|'ambiguous', reason: string }}
 */
export function classifyFile(name, textContent) {
  // 1. OpenAPI 구조 판정 (routeApiDoc 재사용 — 중복 로직 금지)
  if (routeApiDoc(textContent) === 'openapi') {
    return { kind: 'api', reason: 'OpenAPI 구조(openapi:/swagger: 루트)가 감지됨' }
  }

  const ext = (name.split('.').pop() ?? '').toLowerCase()

  // 2. 엑셀/CSV + 격자형 데이터표 판정
  if (ESD_EXTENSIONS.has(ext)) {
    if (isGridTable(textContent)) {
      return { kind: 'esd', reason: '엑셀/CSV 확장자 + 헤더 행과 반복 데이터 행이 감지됨' }
    }
    return { kind: 'ambiguous', reason: '엑셀 확장자이나 격자형 데이터표 구조를 확정할 수 없음' }
  }

  // 3. 서술형 문서 확장자
  if (SCENARIO_EXTENSIONS.has(ext)) {
    return { kind: 'scenario', reason: `서술형 문서 확장자(.${ext})` }
  }

  // 4. 판정 불가
  return { kind: 'ambiguous', reason: '확장자 또는 내용으로 kind를 확정할 수 없음' }
}

/**
 * 텍스트가 헤더 행 + 반복 데이터 행 구조(격자형)인지 판정한다.
 * 탭/쉼표 구분자 기준, 헤더 포함 최소 3행 + 열 수 일관성을 요구한다.
 * @param {string} text
 * @returns {boolean}
 */
function isGridTable(text) {
  if (!text || !text.trim()) return false

  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 3) return false // header + 최소 2 data rows

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headerCols = lines[0].split(delimiter).length
  if (headerCols < 2) return false

  // 모든 데이터 행이 헤더와 같은 열 수를 가져야 격자형으로 판정
  return lines.slice(1).every((l) => l.split(delimiter).length === headerCols)
}

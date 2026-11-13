// 직렬화된 문서 텍스트에서 표별 헤더 후보를 뽑는다 (순수 모듈).
//
// 입력은 serializeWorkbook이 만든 `=== 이름 ===` + 탭 구분 행 형식이다.
// 엑셀과 docx 모두 그 형식을 거치므로 여기서 새로 파싱할 것이 없다.
// 표가 없으면 빈 배열이고, 그때 호출부는 열 매핑 확인 단계를 건너뛴다 —
// 매핑할 열 이름이 없는 입력(서술형·자연어)에 확인 화면을 띄우지 않는다.

export interface TableScan {
  name: string
  title?: string
  headerRow: string[]
  rowCount: number
}

const HEADER_RE = /^===\s*(.*?)\s*===$/

export function scanColumns(text: unknown): TableScan[] {
  const lines = String(text ?? '').split('\n')
  const out: TableScan[] = []
  let current: TableScan | null = null
  let pendingFirstRow: string[] | null = null

  for (const line of lines) {
    const m = line.match(HEADER_RE)
    if (m) {
      // 새 표 시작, 대기 중인 첫 행은 헤더가 됨
      if (current && pendingFirstRow && current.headerRow.length === 0) {
        current.headerRow = pendingFirstRow
        pendingFirstRow = null
      }
      current = { name: m[1], headerRow: [], rowCount: 0 }
      out.push(current)
      continue
    }
    if (!current) continue
    const cells = line.split('\t').map((c) => c.trim())
    if (cells.every((c) => c === '')) continue

    if (current.headerRow.length === 0) {
      if (pendingFirstRow === null) {
        // 첫 번째 비어 있지 않은 행을 대기 중으로 변경
        pendingFirstRow = cells
      } else {
        // 두 번째 행이 나옴. 대기 중인 첫 행이 제목인지 판단
        if (pendingFirstRow.length === 1 && cells.length >= 2) {
          // 첫 행은 제목
          current.title = pendingFirstRow[0]
          current.headerRow = cells
          pendingFirstRow = null
        } else {
          // 첫 행이 헤더, 두 번째 행이 첫 데이터 행
          current.headerRow = pendingFirstRow
          current.rowCount += 1
          pendingFirstRow = null
        }
      }
    } else {
      current.rowCount += 1
    }
  }

  // 루프 끝에서 대기 중인 첫 행은 헤더가 됨
  if (current && pendingFirstRow && current.headerRow.length === 0) {
    current.headerRow = pendingFirstRow
  }

  return out.filter((t) => t.headerRow.length > 0)
}

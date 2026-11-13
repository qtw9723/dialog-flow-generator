// 추출 커버리지 조립 (순수 모듈).
//
// 핵심은 "무엇이 반영됐나"가 아니라 "무엇이 버려졌나"다.
// 지금까지는 문서에 있던 정보가 추출 스키마에 자리가 없어 사라져도 사용자가 알 길이 없었다.

export interface DocCoverage {
  tables: Array<{ name: string; title?: string; headerRow: string[]; rowCount: number }>
  columnMapping: Array<{ column: string; mappedTo: string | null; source: 'dictionary' | 'user' | 'none' }>
  scenarios: Array<{ name: string }>
  unmappedColumns: string[]
  notes: string[]
}

export function buildCoverage(input: {
  tables?: Array<{ name: string; title?: string; headerRow: string[]; rowCount: number }>
  columnMapping?: Array<{ column: string; field: string; source?: 'dictionary' | 'user' }>
  scenarios?: Array<Record<string, unknown>>
}): DocCoverage {
  const tables = Array.isArray(input?.tables) ? input.tables : []
  const mapping = Array.isArray(input?.columnMapping) ? input.columnMapping : []
  const byColumn = new Map(mapping.map((m) => [m.column, m]))

  const columns: string[] = []
  for (const t of tables) for (const c of t.headerRow ?? []) if (!columns.includes(c)) columns.push(c)

  const columnMapping = columns.map((column) => {
    const hit = byColumn.get(column)
    return {
      column,
      mappedTo: hit?.field ?? null,
      source: (hit ? (hit.source ?? 'user') : 'none') as 'dictionary' | 'user' | 'none',
    }
  })
  const unmappedColumns = columnMapping.filter((m) => m.mappedTo === null).map((m) => m.column)

  const scenarios = (Array.isArray(input?.scenarios) ? input.scenarios : [])
    .map((s) => ({ name: String(s?.['시나리오 이름'] ?? '') }))

  const notes: string[] = []
  if (unmappedColumns.length > 0) {
    notes.push(`다음 열은 반영되지 않았습니다: ${unmappedColumns.join(', ')}`)
  }
  return { tables, columnMapping, scenarios, unmappedColumns, notes }
}

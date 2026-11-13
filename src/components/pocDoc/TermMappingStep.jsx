import { useState } from 'react'
import { Button } from '../common/Button'
import { MAPPABLE_FIELDS, suggestField } from '../../lib/pocDoc/termDictionary'

const IGNORE = ''

/**
 * 문서 표의 열 이름을 우리 필드로 대응시키는 확인 화면.
 * 자동 제안이 비어도 사람이 직접 고를 수 있어야 한다 —
 * 병합셀·다단 헤더 문서에서는 이것이 유일한 탈출구다.
 *
 * tables: TableScan[] (scanColumns 결과 — name, title?, headerRow, rowCount)
 * entries: TermEntry[] (termDictionary가 다루는, 학습된 사전 행)
 * onConfirm(mapping): mapping은 Array<{ column: string; field: string; source: 'dictionary' | 'user' }> —
 *   "이 열은 무시"로 고른 열은 이 배열에서 빠진다(그대로 columnMapping으로 서버에 간다).
 *   source는 커버리지 리포트의 출처 표시용이다: 사전 자동 제안을 그대로 확정했으면 'dictionary',
 *   사용자가 다른 값으로 바꿨으면 'user'. 이걸 싣지 않으면 커버리지가 사전이 맞힌 열까지
 *   전부 사람이 고른 것으로 기록한다.
 */
export default function TermMappingStep({ tables, entries, onConfirm, onSkip }) {
  // 같은 열 이름이 여러 표에 있으면 한 번만 보여준다.
  // ⚠ 이때 "표" 칸에는 그 열이 처음 등장한 표만 표시된다 — 같은 이름의 열이
  //   다른 표에도 있다는 사실, 그리고 그 표들의 제목은 화면에 드러나지 않는다.
  const columns = []
  for (const t of tables || []) {
    for (const c of t.headerRow || []) {
      if (!columns.some((x) => x.column === c)) {
        // 표 제목이 있으면 "표 1 — 배송 시나리오"처럼 함께 보여준다 (제목 없으면 표 이름만).
        columns.push({ column: c, table: t.title ? `${t.name} — ${t.title}` : t.name })
      }
    }
  }

  // 사전이 처음 제안한 값 — 최종 선택과 비교해 출처(source)를 판정하는 기준이므로
  // 첫 렌더 값으로 고정한다(매 렌더 재계산하면 비교 기준이 흔들린다).
  const [suggested] = useState(() =>
    Object.fromEntries(columns.map((c) => [c.column, suggestField(c.column, entries) ?? IGNORE])),
  )
  const [picked, setPicked] = useState(suggested)

  const mappedCount = Object.values(picked).filter((v) => v !== IGNORE).length

  const toMapping = () =>
    Object.entries(picked)
      .filter(([, field]) => field !== IGNORE)
      .map(([column, field]) => ({
        column,
        field,
        source: suggested[column] === field ? 'dictionary' : 'user',
      }))

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#1F2937] mb-1">열 매핑 확인</h2>
        <p className="text-xs text-[#6B7280]">
          문서의 열이 무엇을 뜻하는지 확인해 주세요. 자동으로 찾지 못한 열은 직접 고르면 됩니다.
          고른 내용은 다음 문서부터 자동으로 제안됩니다.
        </p>
      </div>

      {columns.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#F3F4F6] text-[#374151]">
                <th className="text-left px-3 py-2 font-medium rounded-tl-lg">열 이름</th>
                <th className="text-left px-3 py-2 font-medium">표</th>
                <th className="text-left px-3 py-2 font-medium rounded-tr-lg">대응 필드</th>
              </tr>
            </thead>
            <tbody>
              {columns.map(({ column, table }) => (
                <tr key={column} className="border-t border-[#E5E7EB] hover:bg-[#F9FAFB]">
                  <td className="px-3 py-2 font-mono text-[#1F2937]">{column}</td>
                  <td className="px-3 py-2 text-[#6B7280]">{table}</td>
                  <td className="px-3 py-2">
                    <select
                      className="text-sm border border-[#D1D5DB] rounded-lg px-2 py-1 focus:outline-none focus:border-primary-500 bg-white"
                      value={picked[column]}
                      onChange={(e) => setPicked((p) => ({ ...p, [column]: e.target.value }))}
                      aria-label={`${column} 매핑 필드 선택`}
                    >
                      <option value={IGNORE}>이 열은 무시</option>
                      {MAPPABLE_FIELDS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#6B7280]">
          표에서 열 이름을 찾지 못했습니다. 건너뛰고 진행할 수 있습니다.
        </p>
      )}

      <p className="text-sm text-[#6B7280]">
        {columns.length}개 열 중 {mappedCount}개를 대응시켰습니다.
      </p>

      <div className="flex gap-3 justify-between pt-1">
        <Button variant="outline" onClick={onSkip}>건너뛰고 추출</Button>
        <Button onClick={() => onConfirm(toMapping())}>이 매핑으로 추출</Button>
      </div>
    </div>
  )
}

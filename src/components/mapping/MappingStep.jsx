import { useState } from 'react'
import { buildConfirmedMapping } from '../../lib/generatorBody'
import { Button } from '../common/Button'

// ESD 필드 하나에 대한 드롭다운 선택기 (candidates + "없음" 옵션)
function FieldSelector({ esdField, candidates, value, onChange }) {
  const fieldKey = esdField.name ?? ''
  return (
    <select
      className="text-sm border border-[#D1D5DB] rounded-lg px-2 py-1 focus:outline-none focus:border-primary-500 bg-white"
      value={value ?? ''}
      onChange={(e) => onChange(fieldKey, e.target.value || null)}
      aria-label={`${fieldKey} 매핑 변수 선택`}
    >
      <option value="">없음 (매핑 안함)</option>
      {candidates.map((c) => (
        <option key={c.varName} value={c.varName}>
          {c.varName} ({c.varType}) — {Math.round(c.score * 100)}%
        </option>
      ))}
    </select>
  )
}

/**
 * ESD 필드 ↔ 수집변수 매핑 확정 UI.
 *
 * proposedMapping: proposeMapping() 반환값 (T1 계약 형태)
 *   { mappings: [{esdField, candidates, auto}], unmappedEsdFields, unmappedVars }
 * onConfirm(confirmedMapping): [{esdField: string, varName: string|null}] 형태 페이로드
 * onCancel(): 취소 (선택사항)
 */
export default function MappingStep({ proposedMapping, onConfirm, onCancel }) {
  const {
    mappings = [],
    unmappedEsdFields = [],
    unmappedVars = [],
  } = proposedMapping ?? {}

  // 초기 선택: auto=true면 candidates[0] 자동 선택, 아니면 candidates[0] 권장 선택
  const [selections, setSelections] = useState(() => {
    const init = {}
    for (const m of mappings) {
      const key = m.esdField?.name ?? ''
      if (m.candidates.length > 0) {
        init[key] = m.candidates[0].varName
      } else {
        init[key] = null
      }
    }
    return init
  })

  const handleSelect = (esdFieldName, varName) => {
    setSelections((prev) => ({ ...prev, [esdFieldName]: varName }))
  }

  const handleConfirm = () => {
    onConfirm(buildConfirmedMapping(mappings, selections))
  }

  // 현재 미매핑 ESD 필드 (selections에서 null인 것 + 애초에 candidates가 없던 것)
  const currentUnmapped = mappings.filter(
    (m) => !selections[m.esdField?.name ?? ''],
  ).map((m) => m.esdField?.name ?? '')

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[#1F2937] mb-1">ESD 매핑 확정</h3>
        <p className="text-xs text-[#6B7280]">
          각 ESD 필드에 매핑할 수집변수를 확인하고 필요하면 변경하세요. 확정 후 2차 생성이 진행됩니다.
        </p>
      </div>

      {/* 매핑 테이블 */}
      {mappings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#F3F4F6] text-[#374151]">
                <th className="text-left px-3 py-2 font-medium rounded-tl-lg">엔티티</th>
                <th className="text-left px-3 py-2 font-medium">ESD 필드</th>
                <th className="text-left px-3 py-2 font-medium">타입</th>
                <th className="text-left px-3 py-2 font-medium rounded-tr-lg">수집변수 선택</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => {
                const fieldName = m.esdField?.name ?? ''
                const isAuto = m.auto
                const hasCandidates = m.candidates.length > 0
                const selectedVar = selections[fieldName]
                return (
                  <tr
                    key={fieldName}
                    className="border-t border-[#E5E7EB] hover:bg-[#F9FAFB]"
                  >
                    <td className="px-3 py-2 text-[#6B7280]">{m.esdField?.entityName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[#1F2937]">{fieldName}</span>
                      {m.esdField?.key && (
                        <span className="ml-1 text-[10px] bg-[#EFF6FF] text-[#2563EB] px-1 py-0.5 rounded">key</span>
                      )}
                      {(m.esdField?.crypt === 'true' || m.esdField?.crypt === true) && (
                        <span className="ml-1 text-[10px] bg-[#FFF7ED] text-[#D97706] px-1 py-0.5 rounded">crypt</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#6B7280]">{m.esdField?.type ?? '—'}</td>
                    <td className="px-3 py-2">
                      {hasCandidates ? (
                        <div className="flex items-center gap-2">
                          <FieldSelector
                            esdField={m.esdField}
                            candidates={m.candidates}
                            value={selectedVar}
                            onChange={handleSelect}
                          />
                          {isAuto && selectedVar && (
                            <span className="text-[10px] bg-[#D1FAE5] text-[#065F46] px-1.5 py-0.5 rounded">자동</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#9CA3AF] text-xs">후보 없음</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#6B7280]">매핑할 ESD 필드가 없습니다.</p>
      )}

      {/* 미매핑 경고 — 현재 selections 기준 */}
      {currentUnmapped.length > 0 && (
        <div className="p-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] text-xs text-[#92400E]">
          <strong>미매핑 ESD 필드 ({currentUnmapped.length}개):</strong>{' '}
          {currentUnmapped.join(', ')} — 2차 생성 시 LLM이 임의 변수명을 사용합니다.
        </div>
      )}

      {/* unmappedVars: 어떤 ESD 필드에도 매핑 후보로 등장하지 않은 수집변수 */}
      {unmappedVars.length > 0 && (
        <div className="p-3 rounded-lg border border-[#FDBA74] bg-[#FFF7ED] text-xs text-[#7C2D12]">
          <strong>ESD 미연결 수집변수 ({unmappedVars.length}개):</strong>{' '}
          {unmappedVars.map((v) => v.name).join(', ')} — ESD 정의에 없는 변수입니다.
        </div>
      )}

      <div className="flex gap-3 justify-between pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            건너뛰기 (1차 결과 사용)
          </Button>
        )}
        <Button onClick={handleConfirm} className="ml-auto">
          이 매핑으로 2차 생성
        </Button>
      </div>
    </div>
  )
}

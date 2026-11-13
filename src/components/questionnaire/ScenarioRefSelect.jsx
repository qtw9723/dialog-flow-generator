import { useEffect, useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { summarizeReference } from '../../lib/refSummary'
import FlowCanvas from '../flow/FlowCanvas'

// 시나리오 항목의 가상 필드: 시나리오 레퍼런스 선택(구조 시드).
// templates 스키마와 무관하게 프론트가 주입 — 선택값은 응답 JSON의 "레퍼런스 선택" 키로만 실린다.
// category(설문에서 고른 산업군)가 있으면 그 산업군 레퍼런스를 상단 그룹으로 보여준다.
export const ScenarioRefSelect = ({ value, onChange, id, category = '' }) => {
  const { request } = useApi()
  const [refs, setRefs] = useState([])
  useEffect(() => {
    let alive = true
    request(API_ENDPOINTS.SCENARIO_REFERENCES)
      .then((data) => { if (alive) setRefs(Array.isArray(data) ? data : []) })
      .catch(() => {})
    return () => { alive = false }
  }, [request])
  if (refs.length === 0) return null

  const same = category ? refs.filter((r) => r.category === category) : []
  const others = category ? refs.filter((r) => r.category !== category) : refs
  const opt = (r) => (
    <option key={r.id} value={r.id}>[{r.category}] {r.name}{r.description ? ` — ${r.description}` : ''}</option>
  )

  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-[#1F2937]">레퍼런스 선택 (선택사항)</label>
      <p className="mb-1 text-xs text-[#6B7280]">고르면 이 시나리오가 해당 레퍼런스의 플로우 구조 그대로 만들어져요(멘트 포함).</p>
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm">
        <option value="">(선택 안 함 — AI가 자유 설계)</option>
        {same.length > 0 ? (
          <>
            <optgroup label={`선택한 산업군 (${category})`}>{same.map(opt)}</optgroup>
            {others.length > 0 && <optgroup label="다른 산업군">{others.map(opt)}</optgroup>}
          </>
        ) : (
          others.map(opt)
        )}
      </select>
      <RefSummaryCard refRow={refs.find((r) => r.id === value)} />
    </div>
  )
}

// 미니 흐름 미리보기 — 스텝 칩 + 화살표 (경량 구조 표현)
const MiniFlowPreview = ({ steps }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 4, gap: 3 }}>
    {steps.map((step, i) => (
      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {step === '…' ? (
          <span style={{ color: '#6B7280', fontSize: 11 }}>…</span>
        ) : (
          <span style={{
            background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4,
            padding: '1px 6px', fontSize: 11, color: '#1E40AF',
            maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', display: 'inline-block',
          }}>
            {step}
          </span>
        )}
        {i < steps.length - 1 && <span style={{ color: '#9CA3AF', fontSize: 10 }}>→</span>}
      </span>
    ))}
  </div>
)

// 선택된 레퍼런스의 흐름 요약 — flow_json에서 자동 파생(설명 수작업 동기화 불필요).
// v0.4.0: 소형 구조 미리보기 + 크게 보기(FlowCanvas 전체화면 뷰어).
const RefSummaryCard = ({ refRow }) => {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!refRow) return null
  const s = summarizeReference(refRow.flow_json)
  if (!s) return null
  const MAX_STEPS = 6
  const steps = s.steps.length > MAX_STEPS ? [...s.steps.slice(0, MAX_STEPS), '…'] : s.steps
  return (
    <div className="mt-2 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-xs text-[#374151]">
      <p className="font-medium text-[#1F2937]">
        {refRow.name} <span className="font-normal text-[#6B7280]">— {refRow.category} · 노드 {s.nodeCount}개{s.branchCount > 0 ? ` · 분기 ${s.branchCount}곳` : ''}</span>
      </p>
      {/* 소형 구조 미리보기 + 크게 보기 버튼 ("흐름: …" 한 줄 대체) */}
      <MiniFlowPreview steps={steps} />
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 6, fontSize: 11, color: 'var(--color-primary-500)', background: 'transparent',
          border: '1px solid var(--color-primary-500)', borderRadius: 4, padding: '2px 8px',
          cursor: 'pointer', lineHeight: 1.4,
        }}
      >
        크게 보기
      </button>
      {s.collects.length > 0 && <p className="mt-0.5">수집: {s.collects.join(', ')}</p>}
      {s.firstMent && <p className="mt-0.5 text-[#6B7280]">첫 멘트: “{s.firstMent.length > 60 ? s.firstMent.slice(0, 60) + '…' : s.firstMent}”</p>}
      {/* 전체화면 FlowCanvas 뷰어 */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #E5E7EB', background: '#fff',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {refRow.name}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {refRow.category}{refRow.description ? ` — ${refRow.description}` : ''}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '5px 10px', fontSize: 12, color: '#374151', background: '#fff',
                border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              }}
            >
              닫기
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <FlowCanvas flowJson={refRow.flow_json} name={refRow.name} readOnly />
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Card, CardBody } from '../common/Card'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'

const TYPE_LABEL = { none: '새 규칙', duplicate: '중복', conflict: '충돌', refine: '보강' }
const TYPE_COLOR = {
  none: 'bg-[#F0FDF4] text-[#166534]', duplicate: 'bg-[#F1F5F9] text-[#6B7280]',
  conflict: 'bg-[#FEF2F2] text-[#991B1B]', refine: 'bg-[#FFFBEB] text-[#92400E]',
}

// 후보별 사용자 결정 옵션(스펙의 결정 모델)
function decisionOptions(type) {
  if (type === 'conflict' || type === 'refine') {
    return [
      { v: 'replace', label: '새 규칙으로 교체' },
      { v: 'skip', label: '기존 규칙 유지' },
      { v: 'edit', label: '수정해서 등록' },
    ]
  }
  if (type === 'duplicate') return [{ v: 'skip', label: '무시(기존 유지)' }, { v: 'replace', label: '새 규칙으로 교체' }]
  return [{ v: 'add', label: '추가' }, { v: 'edit', label: '수정해서 추가' }, { v: 'skip', label: '무시' }]
}
const defaultDecision = (type) => (type === 'conflict' || type === 'refine' ? 'replace' : type === 'duplicate' ? 'skip' : 'add')

// 솔루션 규칙 화면 상단에 끼워지는 학습 패널. onApplied: 적용 후 목록 새로고침 콜백.
export default function RuleLearning({ onApplied }) {
  const [source, setSource] = useState('text')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cards, setCards] = useState([]) // {cand, decision, editText}
  const [applied, setApplied] = useState(null)
  const { request } = useApi()

  const analyze = async () => {
    setError(''); setApplied(null); setLoading(true)
    try {
      const res = await request(`${API_ENDPOINTS.LEARN_SOLUTION_RULES}?action=analyze`, { method: 'POST', body: { source, input } })
      if (res?.error && !(res.candidates || []).length) { setError(res.error); setCards([]); return }
      setCards((res.candidates || []).map((cand) => ({
        cand,
        decision: defaultDecision(cand.conflict?.type || 'none'),
        editText: cand.conflict?.mergedDescription || cand.description,
      })))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => setInput(String(r.result)); r.readAsText(f)
  }

  const setCard = (i, patch) => setCards((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  const apply = async () => {
    setError(''); setLoading(true)
    try {
      const decisions = cards.map(({ cand, decision, editText }) => ({
        decision,
        category: cand.category,
        title: cand.title,
        description: decision === 'edit' ? editText : cand.description,
        content: { text: cand.content?.text || cand.title },
        targetRuleId: cand.conflict?.targetRuleId || undefined,
      }))
      const res = await request(`${API_ENDPOINTS.LEARN_SOLUTION_RULES}?action=apply`, { method: 'POST', body: { decisions } })
      setApplied(res?.applied || null)
      if (res?.errors?.length) setError(res.errors.join('\n'))
      setCards([])
      onApplied?.()  // 하단 규칙 목록 새로고침
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <>
      <Card>
        <CardBody>
          <h3 className="mb-3 text-sm font-semibold text-[#1F2937]">규칙 학습 — 자연어나 예시 봇 JSON에서 규칙을 도출하고 기존 규칙과 정합화합니다</h3>
          <div className="mb-4 flex gap-2">
            <button onClick={() => setSource('text')} className={`rounded px-3 py-1.5 text-sm ${source === 'text' ? 'bg-primary-500 text-white' : 'bg-[#F1F5F9] text-[#6B7280]'}`}>자연어 규칙</button>
            <button onClick={() => setSource('json')} className={`rounded px-3 py-1.5 text-sm ${source === 'json' ? 'bg-primary-500 text-white' : 'bg-[#F1F5F9] text-[#6B7280]'}`}>예시 봇 JSON</button>
          </div>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={source === 'json' ? 10 : 5}
            placeholder={source === 'json' ? '생성된 챗봇 JSON을 붙여넣으세요(안티패턴 → 교정 규칙 도출)' : '규칙을 자연어로 적으세요. 예: _result는 api 노드 밖에서 쓰지 말고 저장한 변수를 사용한다.'}
            className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm font-mono" />
          <div className="mt-2 flex items-center gap-3">
            {source === 'json' && <input type="file" accept="application/json,.json" onChange={onFile} className="text-sm" />}
            <button onClick={analyze} disabled={loading || !input.trim()} className="ml-auto rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {loading ? '분석 중…' : '분석'}
            </button>
          </div>
          {error && <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-[#FEF2F2] p-2 text-xs text-[#991B1B]">{error}</pre>}
          {applied && <p className="mt-3 text-sm text-[#166534]">적용 완료 — 추가 {applied.added} · 수정 {applied.updated} · 무시 {applied.skipped}</p>}
        </CardBody>
      </Card>

      {cards.length > 0 && (
        <Card>
          <CardBody>
            <div className="space-y-4">
              {cards.map(({ cand, decision, editText }, i) => {
                const type = cand.conflict?.type || 'none'
                return (
                  <div key={cand.tempId || i} className="rounded-lg border border-[#E5E7EB] p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${TYPE_COLOR[type]}`}>{TYPE_LABEL[type]}</span>
                      <span className="rounded bg-[#EEF2FF] px-2 py-0.5 text-xs text-[#3730A3]">{cand.category}</span>
                      <span className="text-xs text-[#9CA3AF]">{(cand.stages || []).join(', ')}</span>
                      <span className="font-semibold text-[#1F2937]">{cand.title}</span>
                    </div>
                    <div className="mb-2">
                      <p className="text-xs font-semibold text-[#9CA3AF]">새 규칙(후보)</p>
                      <p className="whitespace-pre-wrap break-words text-sm text-[#374151]">{cand.description}</p>
                    </div>
                    {cand.conflict?.targetRuleId && (
                      <div className="mb-2 rounded bg-[#FFFBEB] p-2 text-xs text-[#92400E]">
                        ⚠ 충돌 대상: <b>{cand.conflict.targetTitle}</b>
                        {cand.conflict.targetDescription && (
                          <p className="mt-1 whitespace-pre-wrap break-words font-normal text-[#78716C]">{cand.conflict.targetDescription}</p>
                        )}
                        <p className="mt-1 font-normal">근거: {cand.conflict.rationale}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {decisionOptions(type).map((o) => (
                        <label key={o.v} className="flex items-center gap-1 text-sm">
                          <input type="radio" name={`d-${i}`} checked={decision === o.v} onChange={() => setCard(i, { decision: o.v })} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {decision === 'edit' && (
                      <textarea value={editText} onChange={(e) => setCard(i, { editText: e.target.value })} rows={4}
                        className="mt-2 w-full rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={apply} disabled={loading} className="rounded-md bg-[#16A34A] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {loading ? '적용 중…' : '선택한 결정 적용'}
              </button>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  )
}

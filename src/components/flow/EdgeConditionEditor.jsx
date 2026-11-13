import { useMemo, useState } from 'react'
import { conditionLabel } from '../../lib/refDiagram.js'
import { availableVars, buildConditionExpr, parseCondition, OPERATORS } from '../../lib/flow/conditionBuilder.js'

// 연결선 조건 편집기 — 가이드 빌더(변수+연산자+값) + 직접 입력(고급).
// 엣지 A→B의 조건은 타겟 B의 진입 조건(condition)으로 저장된다. 표시 라벨은 conditionLabel 자동.
// 다이어그램 캔버스 밖(편집 패널)에서 렌더 — 캔버스 컨트롤과 겹치지 않게. key={edgeId}로 재마운트 시드.

const CUSTOM_VAR = '__custom__'
const SELECT = 'border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white'
const INPUT = 'border border-gray-300 rounded-md px-2 py-1.5 text-sm'

export default function EdgeConditionEditor({ condition = '', sourceLabel, targetLabel, flowJson, onApply, onClose }) {
  const vars = useMemo(() => availableVars(flowJson), [flowJson])
  const [st, setSt] = useState(() => {
    const parsed = parseCondition(condition)
    if (!parsed) return { mode: 'advanced', subject: '', customSubject: '', operator: 'includes', value: '', raw: condition }
    const inList = parsed.subject === '' || vars.includes(parsed.subject)
    return {
      mode: 'guide',
      subject: inList ? parsed.subject : CUSTOM_VAR,
      customSubject: inList ? '' : parsed.subject,
      operator: parsed.operator,
      value: parsed.value,
      raw: condition,
    }
  })

  const subject = st.subject === CUSTOM_VAR ? (st.customSubject || '') : st.subject
  const opDef = OPERATORS.find((o) => o.id === st.operator) || OPERATORS[0]
  const expr = st.mode === 'advanced' ? String(st.raw || '') : buildConditionExpr(subject, st.operator, st.value)
  const preview = conditionLabel(expr)
  const set = (patch) => setSt((prev) => ({ ...prev, ...patch }))
  const canApply = st.mode === 'advanced' ? true : !!expr

  return (
    <div className="border border-primary-500 rounded-lg bg-blue-50/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-[#1F2937]">
          연결 조건 · <span className="text-primary-500">{sourceLabel}</span> → <span className="text-primary-500">{targetLabel}</span>
        </span>
        <div className="flex items-center gap-3">
          <button onClick={() => set({ mode: st.mode === 'guide' ? 'advanced' : 'guide', raw: st.mode === 'guide' ? expr : st.raw })}
            className="text-xs text-primary-500 underline">
            {st.mode === 'guide' ? '직접 입력' : '가이드'}
          </button>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">닫기 ✕</button>
        </div>
      </div>

      {st.mode === 'guide' ? (
        <div className="flex flex-wrap items-center gap-2">
          <select value={st.subject} onChange={(e) => set({ subject: e.target.value })} className={SELECT}>
            <option value="">변수 선택…</option>
            {vars.map((v) => <option key={v} value={v}>{v}</option>)}
            <option value={CUSTOM_VAR}>✎ 직접 입력</option>
          </select>
          {st.subject === CUSTOM_VAR && (
            <input value={st.customSubject || ''} onChange={(e) => set({ customSubject: e.target.value })}
              placeholder="변수명 (예: local.status)" className={`${INPUT} w-44`} />
          )}
          <select value={st.operator} onChange={(e) => set({ operator: e.target.value })} className={SELECT}>
            {OPERATORS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {opDef.needsValue && (
            <input value={st.value} onChange={(e) => set({ value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && expr) onApply(expr) }}
              placeholder="값 (예: 취소)" className={`${INPUT} w-40`} />
          )}
        </div>
      ) : (
        <input value={st.raw || ''} onChange={(e) => set({ raw: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onApply(st.raw) }}
          placeholder="조건식 예: input.text.includes('취소')" className={`${INPUT} w-full`} />
      )}

      <div className="text-xs text-gray-600 mt-2 min-h-[16px]">
        {expr
          ? <>식: <code className="text-gray-900">{expr}</code> · 라벨 <span className="text-primary-500 font-semibold">{preview}</span></>
          : <span className="text-gray-400">변수·연산자를 고르면 조건식이 만들어져요</span>}
      </div>

      <div className="flex gap-2 mt-2">
        <button onClick={() => onApply(expr)} disabled={!canApply}
          className="px-4 py-1.5 rounded bg-primary-500 text-white text-sm font-semibold hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-default">
          적용
        </button>
        <button onClick={() => { set({ subject: '', customSubject: '', value: '', raw: '' }); onApply('') }}
          className="px-3 py-1.5 rounded border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
          지우기
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">조건은 타겟 노드의 진입 조건입니다 — 같은 노드로 들어오는 다른 연결과 공유될 수 있어요.</p>
    </div>
  )
}

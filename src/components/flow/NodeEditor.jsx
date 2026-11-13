import { useMemo, useRef, useState } from 'react'
import { nodeTypeInfo } from '../../lib/flow/nodeTypeRegistry.js'
import { nodeViewFields } from '../../lib/flow/nodeView.js'
import { readNodeFields, writeNodeConfig, SCOPES, ESD_OPS, ESD_EXPRESSIONS, STACK_ACTIONS, STACK_ACTION_KO } from '../../lib/flow/nodeConfig.js'
import { BODY_STEP_TYPES, bodyStepId } from '../../lib/flow/loopBody.js'
import { availableVars } from '../../lib/flow/conditionBuilder.js'

// 노드 내용(기능) 편집기 — 다이어그램 편집 모드에서 노드를 선택하면 캔버스 밖(편집 패널)에 렌더.
// 공통 라벨 + 타입별 필드. 반복(subflow)은 종료조건·횟수 + '반복 본문' 스텝 리스트를 함께 관리한다.
// 적용 시 onApply(fields)로 부모(FlowCanvas)가 캔버스 data와 flow에 반영. key={node.id}로 재마운트.

const KIND_KO = {
  output: '안내', input: '입력', set: '저장', node: '분기', condition: '분기',
  subflow: '반복', llmchat: 'AI 응답', api: 'API 연동', esd: '기록 저장',
}
const ESD_OP_KO = { findone: '단건 조회', findall: '전체 조회', create: '저장(생성)', update: '수정', remove: '삭제' }
const EXPR_KO = { eq: '=', neq: '≠', gt: '>', lt: '<', gte: '≥', lte: '≤', like: '포함' }
const SCOPE_KO = { local: '지역변수(이 플로우 안)', context: '전역변수', secure: '암호화 전역변수(개인정보)' }

const LABEL = 'text-xs font-semibold text-gray-600 mb-1'
const INPUT = 'border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full'
const SELECT = 'border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white'
const MINI = 'border border-gray-300 rounded px-2 py-1 text-sm'

function esdEntities(result) {
  const esd = result?.bundle?.esd
  if (esd && Array.isArray(esd.entities)) return esd.entities
  const schemas = result?.bundle?.esd_schemas
  return Array.isArray(schemas) ? schemas : []
}
function apiDefs(result) {
  const defs = result?.bundle?.api_defs
  return Array.isArray(defs) ? defs : []
}
const stripLT = ({ type, label, ...rest }) => rest  // readNodeFields 결과에서 type/label 제거 → 순수 필드

// 변수 입력(제안 datalist 포함)
function VarInput({ value, onChange, vars, placeholder, listId }) {
  return (
    <>
      <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={INPUT} />
      <datalist id={listId}>{vars.map((v) => <option key={v} value={v} />)}</datalist>
    </>
  )
}

// 필드명 선택(스키마 필드 드롭다운 + 직접 입력 폴백)
function FieldPick({ fields, value, onChange }) {
  if (!fields.length) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="필드명" className={`${MINI} w-28`} />
  }
  const known = fields.includes(value) || value === ''
  return (
    <select value={known ? value : '__c'} onChange={(e) => onChange(e.target.value === '__c' ? '' : e.target.value)} className={`${MINI} w-32`}>
      <option value="">필드…</option>
      {fields.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>
  )
}

// 행 편집기(추가/삭제)
function RowEditor({ label, rows, onChange, blank, render }) {
  const upd = (i, patch) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            {render(row, (patch) => upd(i, patch))}
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="text-gray-400 hover:text-red-500 text-sm px-1">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, { ...blank }])}
          className="text-xs text-primary-500 hover:underline">+ 행 추가</button>
      </div>
    </div>
  )
}

// ── 타입별 필드(라벨 제외) — 최상위 노드·반복 본문 스텝에서 공용 ──────────────
function TypeFields({ type, f, set, vars, entities, defs, idPrefix = 'ne' }) {
  const esdFields = useMemo(() => {
    const ent = entities.find((e) => e?.name === f.schemaName)
    return Array.isArray(ent?.fields) ? ent.fields.map((x) => x?.name).filter(Boolean) : []
  }, [entities, f.schemaName])

  switch (type) {
    case 'output':
      return (
        <div>
          <div className={LABEL}>멘트 (봇이 하는 말)</div>
          <textarea value={f.ment || ''} onChange={(e) => set({ ment: e.target.value })} rows={3}
            placeholder="예: 현재 배송 중입니다." className={INPUT} />
        </div>
      )
    case 'set':
    case 'input':
      return (
        <div className="space-y-2">
          <div className="flex gap-2 items-end">
            <div>
              <div className={LABEL}>스코프</div>
              <select value={f.scope} onChange={(e) => set({ scope: e.target.value })} className={SELECT}>
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <div className={LABEL}>{type === 'input' ? '담을 변수명' : '변수명'} (영문)</div>
              <input value={f.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="예: trackingNo" className={INPUT} />
            </div>
          </div>
          <p className="text-xs text-gray-400">{SCOPE_KO[f.scope] || ''}</p>
          {type === 'set' && (
            <div>
              <div className={LABEL}>값 (식)</div>
              <div className="flex gap-2 items-center">
                <VarInput value={f.value || ''} onChange={(v) => set({ value: v })} vars={vars} placeholder="예: input.text 또는 'paid'" listId={`${idPrefix}-set-val`} />
                <button type="button" onClick={() => set({ value: 'input.text' })} className={`${MINI} whitespace-nowrap text-primary-500`}>사용자 입력</button>
              </div>
            </div>
          )}
          {type === 'input' && <p className="text-xs text-gray-400">사용자 입력(input.text)을 위 변수에 저장합니다.</p>}
        </div>
      )
    case 'esd':
      return (
        <div className="space-y-2">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <div className={LABEL}>기록 대상(스키마)</div>
              <select value={f.schemaName} onChange={(e) => set({ schemaName: e.target.value })} className={`${SELECT} w-full`}>
                <option value="">스키마 선택…</option>
                {entities.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <div className={LABEL}>동작</div>
              <select value={f.opType} onChange={(e) => set({ opType: e.target.value })} className={SELECT}>
                {ESD_OPS.map((o) => <option key={o} value={o}>{ESD_OP_KO[o]}</option>)}
              </select>
            </div>
          </div>
          {f.opType === 'create' ? (
            <RowEditor label="저장할 데이터" rows={f.data || []} onChange={(data) => set({ data })}
              blank={{ field: '', value: '' }} render={(row, upd) => (
                <>
                  <FieldPick fields={esdFields} value={row.field} onChange={(v) => upd({ field: v })} />
                  <VarInput value={row.value} onChange={(v) => upd({ value: v })} vars={vars} placeholder="값/식" listId={`${idPrefix}-esd-d-${row.field}`} />
                </>
              )} />
          ) : (
            <RowEditor label="조건(where)" rows={f.where || []} onChange={(where) => set({ where })}
              blank={{ field: '', expression: 'eq', value: '' }} render={(row, upd) => (
                <>
                  <FieldPick fields={esdFields} value={row.field} onChange={(v) => upd({ field: v })} />
                  <select value={row.expression} onChange={(e) => upd({ expression: e.target.value })} className={MINI}>
                    {ESD_EXPRESSIONS.map((x) => <option key={x} value={x}>{EXPR_KO[x]}</option>)}
                  </select>
                  <VarInput value={row.value} onChange={(v) => upd({ value: v })} vars={vars} placeholder="값/식" listId={`${idPrefix}-esd-w-${row.field}`} />
                </>
              )} />
          )}
          <div>
            <div className={LABEL}>결과 저장 변수 (선택)</div>
            <VarInput value={f.resultKey || ''} onChange={(v) => set({ resultKey: v })} vars={vars} placeholder="예: local.배송상태" listId={`${idPrefix}-esd-res`} />
          </div>
        </div>
      )
    case 'api': {
      const selDef = defs.find((d) => d?.name === f.apiName)
      const onPickApi = (name) => {
        const def = defs.find((d) => d?.name === name)
        const defParams = Array.isArray(def?.params) ? def.params : []
        const prev = new Map((f.params || []).map((p) => [p.key, p.value]))
        set({ apiName: name, params: defParams.map((p) => ({ key: p.name, value: prev.get(p.name) || '' })) })
      }
      return (
        <div className="space-y-2">
          <div>
            <div className={LABEL}>연동 API</div>
            <select value={f.apiName} onChange={(e) => onPickApi(e.target.value)} className={`${SELECT} w-full`}>
              <option value="">API 선택…</option>
              {defs.map((d) => <option key={d.name} value={d.name}>{d.name}{d.method ? ` (${d.method})` : ''}</option>)}
            </select>
            {defs.length === 0 && <p className="text-xs text-amber-600 mt-1">이 결과에 등록된 API 정의가 없습니다.</p>}
          </div>
          {(f.params || []).length > 0 && (
            <div>
              <div className={LABEL}>파라미터 값 바인딩</div>
              <div className="space-y-1">
                {(f.params || []).map((p, i) => (
                  <div key={p.key} className="flex gap-2 items-center">
                    <span className="text-xs text-gray-600 w-28 truncate" title={p.key}>{p.key}</span>
                    <VarInput value={p.value} onChange={(v) => set({ params: f.params.map((x, j) => j === i ? { ...x, value: v } : x) })}
                      vars={vars} placeholder="값/식 (예: ${local.trackingNo})" listId={`${idPrefix}-api-p-${p.key}`} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {selDef?.url && <p className="text-xs text-gray-400 truncate">엔드포인트: {selDef.method || ''} {selDef.url}</p>}
          <div>
            <div className={LABEL}>결과 저장 변수 (선택)</div>
            <VarInput value={f.resultKey || ''} onChange={(v) => set({ resultKey: v })} vars={vars} placeholder="예: local.배송상태" listId={`${idPrefix}-api-res`} />
          </div>
        </div>
      )
    }
    case 'llmchat':
      return (
        <div className="space-y-2">
          <div>
            <div className={LABEL}>프롬프트 (AI 지시문)</div>
            <textarea value={f.prompt || ''} onChange={(e) => set({ prompt: e.target.value })} rows={4}
              placeholder="예: 너는 친절한 상담원이야. 사용자의 배송 문의에 답해." className={INPUT} />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-xs text-gray-600 flex items-center gap-1">
              히스토리 <input value={f.history || ''} onChange={(e) => set({ history: e.target.value })} className={`${MINI} w-16`} />
            </label>
            <label className="text-xs text-gray-600 flex items-center gap-1">
              <input type="checkbox" checked={f.stream !== false} onChange={(e) => set({ stream: e.target.checked })} /> 스트리밍
            </label>
          </div>
          <p className="text-xs text-gray-400">모델·API 키는 DialogFlow에서 설정합니다(여기서 비워둠).</p>
        </div>
      )
    case 'stack': {
      const items = f.items || []
      const patchItem = (i, patch) => set({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
      return (
        <div className="space-y-2">
          <div>
            <div className={LABEL}>화면 동작</div>
            <select value={f.action || 'clear'} onChange={(e) => set({ action: e.target.value })} className={SELECT}>
              {STACK_ACTIONS.map((a) => <option key={a} value={a}>{STACK_ACTION_KO[a]}</option>)}
            </select>
          </div>
          <div>
            <div className={LABEL}>함께 설정할 변수 (선택)</div>
            {items.length === 0 && <p className="text-xs text-gray-400">없음 — 화면만 이동합니다.</p>}
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 items-center mb-1">
                <input value={it.key} onChange={(e) => patchItem(i, { key: e.target.value })}
                  placeholder="변수 (예: context.pCnt)" className={INPUT} />
                <input value={it.value} onChange={(e) => patchItem(i, { value: e.target.value })}
                  placeholder="값 (예: null)" className={INPUT} />
                <button type="button" onClick={() => set({ items: items.filter((_, j) => j !== i) })}
                  className={`${MINI} text-red-500`}>삭제</button>
              </div>
            ))}
            <button type="button" onClick={() => set({ items: [...items, { key: '', value: '' }] })}
              className="text-xs text-primary-500 hover:underline">+ 행 추가</button>
          </div>
          <p className="text-xs text-gray-400">화면을 이동하면서 변수를 비우거나(예: <code>null</code>) 값을 넣을 수 있습니다.</p>
        </div>
      )
    }
    case 'node':
    case 'condition':
      return <p className="text-xs text-gray-500">분기 노드입니다. 분기 조건은 <b>나가는 연결선(엣지)</b>을 클릭해 설정하세요.</p>
    default: {
      // 편집기가 없는 타입 — **내용은 읽기 좋게 보여주고 수정만 막는다**(2026-08-28 사용자 제안).
      // 서술자가 있으면 항목별로 펴서 보여주고, 없으면 원시 config로 폴백한다(정보를 감추지 않는다).
      const info = nodeTypeInfo(type)
      const raw = f?.rawConfig
      const { fields, hasView } = nodeViewFields(type, raw)
      return (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            <b>{info.label}</b> 타입은 내용 편집을 지원하지 않습니다 (<code>{String(type || '')}</code>).
            <br /><b>이름은 위에서 바꿀 수 있고</b>, 연결선 재연결·노드 삭제도 다이어그램에서 그대로 됩니다.
          </p>

          {hasView && fields.length > 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 divide-y divide-gray-200">
              {fields.map((fd, i) => (
                <div key={i} className="px-3 py-2">
                  <div className="text-[11px] font-medium text-gray-500">
                    {fd.label}
                    {fd.note && <span className="ml-1 font-normal text-amber-700">· {fd.note}</span>}
                  </div>
                  {Array.isArray(fd.value) ? (
                    <ul className="mt-0.5 space-y-0.5">
                      {fd.value.map((v, j) => (
                        <li key={j} className="text-xs text-gray-800 break-all">{v}</li>
                      ))}
                    </ul>
                  ) : fd.kind === 'code' ? (
                    <pre className="mt-0.5 text-[11px] text-gray-800 whitespace-pre-wrap break-all max-h-32 overflow-auto">{fd.value}</pre>
                  ) : (
                    <div className="mt-0.5 text-xs text-gray-800 break-all">{fd.value}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasView && fields.length === 0 && (
            <p className="text-xs text-gray-400">설정된 내용이 없습니다.</p>
          )}

          {!hasView && raw !== undefined && (
            <div>
              <div className={LABEL}>원본 설정 (읽기 전용)</div>
              <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )
    }
  }
}

// ── 반복 본문 스텝 편집기 ─────────────────────────────────────────────────────
function BodyStepEditor({ steps, setSteps, loopId, seqRef, vars, entities, defs }) {
  const [openIdx, setOpenIdx] = useState(-1)
  const patch = (i, p) => setSteps(steps.map((s, j) => j === i ? { ...s, ...p } : s))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const next = steps.slice(); [next[i], next[j]] = [next[j], next[i]]; setSteps(next)
  }
  const addStep = (type) => {
    seqRef.current += 1
    const seed = stripLT(readNodeFields({ type, config: {} }))
    setSteps([...steps, { id: bodyStepId(loopId, seqRef.current), type, label: '', fields: seed }])
    setOpenIdx(steps.length)
  }
  return (
    <div>
      <div className={LABEL}>반복 본문 (순서대로 반복)</div>
      <div className="space-y-1.5">
        {steps.length === 0 && <p className="text-xs text-gray-400">본문 스텝이 없습니다 — 아래에서 추가하세요.</p>}
        {steps.map((s, i) => (
          <div key={s.id} className="border border-gray-200 rounded-md bg-white">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-xs text-gray-400 w-5 text-center">{i + 1}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">{KIND_KO[s.type] || s.type}</span>
              <input value={s.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="스텝 이름" className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm min-w-0" />
              <button type="button" title="위로" onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 text-xs px-0.5">↑</button>
              <button type="button" title="아래로" onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 text-xs px-0.5">↓</button>
              <button type="button" title="내용" onClick={() => setOpenIdx(openIdx === i ? -1 : i)} className="text-primary-500 text-xs px-0.5">{openIdx === i ? '접기' : '내용'}</button>
              <button type="button" title="삭제" onClick={() => { setSteps(steps.filter((_, j) => j !== i)); setOpenIdx(-1) }} className="text-gray-400 hover:text-red-500 text-sm px-0.5">✕</button>
            </div>
            {openIdx === i && (
              <div className="border-t border-gray-100 px-3 py-2">
                <TypeFields type={s.type} f={s.fields} set={(p) => patch(i, { fields: { ...s.fields, ...p } })}
                  vars={vars} entities={entities} defs={defs} idPrefix={`bs-${s.id}`} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <select value="" onChange={(e) => { if (e.target.value) addStep(e.target.value) }} className={`${MINI}`}>
          <option value="">+ 본문 스텝 추가…</option>
          {BODY_STEP_TYPES.map((t) => <option key={t} value={t}>{KIND_KO[t] || t}</option>)}
        </select>
      </div>
    </div>
  )
}

export default function NodeEditor({ node, flowJson, result, onApply, onClose }) {
  const [f, setF] = useState(() => readNodeFields(node))
  const vars = useMemo(() => availableVars(flowJson), [flowJson])
  const entities = useMemo(() => esdEntities(result), [result])
  const defs = useMemo(() => apiDefs(result), [result])
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const kindKo = KIND_KO[node.type] || node.type
  const isLoop = node.type === 'subflow'

  // 반복 본문 스텝 상태 — {id,type,label,fields}. 새 스텝 id 시퀀스는 기존 최대치 이후부터.
  const seqRef = useRef(
    (node.body || []).reduce((mx, s) => {
      const m = String(s.id || '').match(new RegExp(`^${node.id}__b(\\d+)$`))
      return m ? Math.max(mx, Number(m[1])) : mx
    }, 0),
  )
  const [steps, setSteps] = useState(() =>
    isLoop ? (node.body || []).map((s) => ({ id: s.id, type: s.type, label: String(s.label || ''), fields: stripLT(readNodeFields({ type: s.type, config: s.config || {} })) })) : [],
  )

  const handleApply = () => {
    if (isLoop) {
      const bodySteps = steps.map((s) => ({ id: s.id, type: s.type, label: s.label, config: writeNodeConfig(s.type, {}, s.fields) }))
      onApply({ label: f.label, condition: f.condition, count: f.count, bodySteps })
    } else {
      onApply(f)
    }
  }

  return (
    <div className="border border-primary-500 rounded-lg bg-blue-50/40 p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#1F2937]">노드 편집 · <span className="text-primary-500">{kindKo}</span></span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">닫기 ✕</button>
      </div>

      <div className="mb-3">
        <div className={LABEL}>이름 (라벨)</div>
        <input value={f.label || ''} onChange={(e) => set({ label: e.target.value })} placeholder="예: 배송 상태 안내" className={INPUT} />
      </div>

      {isLoop ? (
        <div className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <div className={LABEL}>반복 종료조건 (식)</div>
              <VarInput value={f.condition || ''} onChange={(v) => set({ condition: v })} vars={vars} placeholder="예: context.ok == true" listId="ne-loop-cond" />
            </div>
            <div>
              <div className={LABEL}>최대 횟수</div>
              <input value={f.count || ''} onChange={(e) => set({ count: e.target.value })} placeholder="예: 3" className={`${INPUT} w-24`} />
            </div>
          </div>
          <BodyStepEditor steps={steps} setSteps={setSteps} loopId={node.id} seqRef={seqRef} vars={vars} entities={entities} defs={defs} />
        </div>
      ) : (
        <TypeFields type={node.type} f={f} set={set} vars={vars} entities={entities} defs={defs} />
      )}

      <div className="flex gap-2 mt-3">
        <button onClick={handleApply} className="px-4 py-1.5 rounded bg-primary-500 text-white text-sm font-semibold hover:bg-primary-700">적용</button>
        <button onClick={onClose} className="px-3 py-1.5 rounded border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">취소</button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { FormInput } from '../common/FormInput'
import { Button } from '../common/Button'
import { SectionHelp } from '../common/SectionHelp'
import { FieldHelp } from '../common/FieldHelp'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { getHelpByName, apiNameError } from './scenarioFields'
import { makeEmptyIntegration } from '../../lib/scenario/steps'

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const NEW = '새로 입력'
const API_WAY = '외부 시스템 호출 (API)'
const ESD_WAY = '내부 데이터 저장·조회 (ESD)'

const isBodyMethod = (method) => {
  const m = String(method || 'GET').toLowerCase()
  return m !== 'get' && m !== 'delete'
}
const isValidJson = (s) => { try { JSON.parse(s); return true } catch { return false } }

// JSON 문자열 → content KV(최상위 키, best-effort). 중첩값은 JSON 문자열로. 실패 시 [].
function jsonToContent(raw) {
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object' || Array.isArray(o)) return []
    return Object.entries(o).map(([key, v]) => ({ key, value: typeof v === 'string' ? v : JSON.stringify(v) }))
  } catch { return [] }
}

// url/헤더/쿼리/바디(KV·JSON)에서 ${변수} 추출(테스트 샘플값 입력용)
function extractVars(item) {
  const texts = [
    item['엔드포인트 URL'],
    ...((item['헤더'] || []).map((h) => h.value)),
    ...((item['파라미터'] || []).map((p) => p.value)),
    ...((item['바디'] || []).map((b) => b.value)),
    item['바디 JSON'],
  ]
  const names = new Set()
  for (const t of texts) for (const m of String(t || '').matchAll(/\$\{([^}]+)\}/g)) names.add(m[1].trim())
  return [...names]
}
function buildDefFromItem(item) {
  const method = (item['method'] || 'GET').toLowerCase()
  const isBody = isBodyMethod(method)
  const rawBody = isBody && item['바디 형식'] === 'json' ? String(item['바디 JSON'] || '').trim() : ''
  const def = {
    name: item['API 이름'] || (item['연동 목적'] || 'customApi'),
    description: item['연동 목적'] || '',
    method,
    contentType: isBody ? 'json' : 'query',
    headers: (item['헤더'] || []).filter((h) => h.key),
    // 바디 메서드: rawBody(파싱) > 바디 KV / 쿼리 메서드: 파라미터 KV(→쿼리스트링)
    content: isBody
      ? (rawBody ? jsonToContent(rawBody) : (item['바디'] || []).filter((b) => b.key))
      : (item['파라미터'] || []).filter((p) => p.key),
    url: item['엔드포인트 URL'] || '',
    authType: 'noAuth',
    authParams: {},
    params: [],
    result: { type: 'json', _error: '', _result: '' },
  }
  if (rawBody) def.rawBody = rawBody  // JSON 통째 입력은 테스트/호출 시 그대로 전송(content보다 우선)
  return def
}

// key-value 행 편집기
function KvRows({ label, rows, onChange, help, hideLabel, optional }) {
  const list = Array.isArray(rows) ? rows : []
  const set = (i, k, v) => onChange(list.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  return (
    <div className="mb-2">
      {!hideLabel && <label className="mb-1 block text-xs font-semibold text-[#6B7280]">{label}{optional && <span className="font-normal text-[#9CA3AF]"> (선택사항)</span>}<FieldHelp text={help} /></label>}
      {list.map((r, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <input value={r.key || ''} onChange={(e) => set(i, 'key', e.target.value)} placeholder="key" className="w-1/3 rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
          <input value={r.value || ''} onChange={(e) => set(i, 'value', e.target.value)} placeholder="value (예: ${pid})" className="flex-1 rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
          <button type="button" onClick={() => onChange(list.filter((_, idx) => idx !== i))} className="px-2 text-sm text-[#EF4444]">×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { key: '', value: '' }])} className="text-xs text-primary-500">+ {label} 추가</button>
    </div>
  )
}

// 바디 편집기: key-value ↔ JSON 직접 입력 토글
function BodyField({ item, onUpdate }) {
  const mode = item['바디 형식'] === 'json' ? 'json' : 'kv'
  const raw = item['바디 JSON'] || ''
  const jsonErr = mode === 'json' && raw.trim() && !isValidJson(raw)
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-[#6B7280]">바디<span className="font-normal text-[#9CA3AF]"> (선택사항)</span><FieldHelp text={getHelpByName('바디')} /></span>
        <div className="ml-auto inline-flex overflow-hidden rounded border border-[#E5E7EB] text-xs">
          <button type="button" onClick={() => onUpdate('바디 형식', 'kv')} className={`px-2 py-0.5 ${mode === 'kv' ? 'bg-primary-500 text-white' : 'text-[#6B7280]'}`}>key-value</button>
          <button type="button" onClick={() => onUpdate('바디 형식', 'json')} className={`px-2 py-0.5 ${mode === 'json' ? 'bg-primary-500 text-white' : 'text-[#6B7280]'}`}>JSON</button>
        </div>
      </div>
      {mode === 'kv'
        ? <KvRows label="바디" rows={item['바디']} onChange={(v) => onUpdate('바디', v)} hideLabel />
        : (
          <>
            <textarea value={raw} onChange={(e) => onUpdate('바디 JSON', e.target.value)} rows={5}
              placeholder={'{\n  "name": "${이름}",\n  "age": 30\n}'}
              className="w-full rounded border border-[#E5E7EB] px-2 py-1 font-mono text-xs" />
            <p className={`mt-0.5 text-xs ${jsonErr ? 'text-[#EF4444]' : 'text-[#9CA3AF]'}`}>
              {jsonErr ? '유효한 JSON이 아니에요.' : '값에 ${변수} 사용 가능. 중첩 JSON도 그대로 전송돼요.'}
            </p>
          </>
        )}
    </div>
  )
}

// 시나리오의 '외부 연동' 전용 에디터. API 연동은 등록 API 재사용 또는 직접입력 + 필수 테스트.
// single: 시나리오 흐름의 '연동' 단계 카드 안에서 연동 하나만 편집(제목·추가/삭제 버튼은 단계 카드가 맡는다).
export default function ApiIntegrationField({ value, onChange, sharedPool, focusIntegration, single = false, idPrefix = 'int' }) {
  const items = Array.isArray(value) ? value : []
  // 단계마다 연동 편집기가 하나씩 있으므로(single, 항상 index 0) DOM id가 겹치지 않게 접두를 받는다.
  const idBase = idPrefix
  const [registered, setRegistered] = useState([])
  const [tests, setTests] = useState({})     // index → {loading, result}
  const [regs, setRegs] = useState({})       // index → {loading, done, error} (라이브러리 등록)
  const [samples, setSamples] = useState({}) // index → {varName: value}
  const [flashIndex, setFlashIndex] = useState(null) // 검증 실패로 잠깐 하이라이트할 연동
  const blockRefs = useRef({})               // index → 연동 블록 DOM 노드
  const { request } = useApi()

  // 검증 실패한 외부 연동으로 자동 스크롤 + 1.5초 링 하이라이트. nonce 변화로 매 시도마다 재트리거.
  useEffect(() => {
    if (!focusIntegration) return
    const node = blockRefs.current[focusIntegration.index]
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashIndex(focusIntegration.index)
    const t = setTimeout(() => setFlashIndex(null), 1500)
    return () => clearTimeout(t)
  }, [focusIntegration?.nonce, focusIntegration?.index])

  const loadRegistered = useCallback(async () => {
    try { const d = await request(API_ENDPOINTS.API_REFERENCES); setRegistered(Array.isArray(d) ? d : []) } catch { /* noop */ }
  }, [request])
  useEffect(() => { loadRegistered() }, [loadRegistered])

  // 값 변경 시 테스트 무효화(_tested=false). _tested 자체 변경은 제외.
  const update = (i, key, v) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, [key]: v, ...(key === '_tested' ? {} : { _tested: false }) } : it)))
  // '결과를 담을 이름'은 그 연동의 출력값 → 같은 항목의 '보낼 정보'(입력)에 자기 자신이 들어가면 안 된다.
  const updateResultName = (i, v) =>
    onChange(items.map((it, idx) => (idx === i
      ? { ...it, '결과를 담을 이름': v, '보낼 정보': (Array.isArray(it['보낼 정보']) ? it['보낼 정보'] : []).filter((x) => x !== v), _tested: false }
      : it)))
  const add = () => onChange([...items, makeEmptyIntegration()])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))

  const runTest = async (i) => {
    const item = items[i]
    const sel = item['사용할 API']
    let apiDef
    if (sel && sel !== NEW) apiDef = (registered.find((r) => r.name === sel) || {}).api_def
    else apiDef = buildDefFromItem(item)
    if (!apiDef || !apiDef.url) { setTests((t) => ({ ...t, [i]: { result: { ok: false, error: '엔드포인트 URL이 필요합니다.' } } })); return }

    setTests((t) => ({ ...t, [i]: { loading: true } }))
    try {
      const res = await request(`${API_ENDPOINTS.API_REFERENCES}?action=test`, { method: 'POST', body: { api_def: apiDef, paramValues: samples[i] || {} } })
      setTests((t) => ({ ...t, [i]: { loading: false, result: res } }))
      // 통과 표시만 한다(자동 등록하지 않음). 라이브러리 등록은 사용자가 버튼으로.
      if (res?.ok) update(i, '_tested', true)
    } catch (e) {
      setTests((t) => ({ ...t, [i]: { loading: false, result: { ok: false, error: e.message } } }))
    }
  }

  // 테스트 통과한 직접입력 API를 사용자가 명시적으로 라이브러리에 등록(이름 필수). 등록 후 그 API를 선택 상태로(재사용).
  const registerToLibrary = async (i) => {
    const item = items[i]
    const apiDef = buildDefFromItem(item)
    if (!String(item['API 이름'] || '').trim()) { setRegs((r) => ({ ...r, [i]: { error: 'API 이름을 입력하세요.' } })); return }
    const nameMsg = apiNameError(item['API 이름'])
    if (nameMsg) { setRegs((r) => ({ ...r, [i]: { error: nameMsg } })); return }
    setRegs((r) => ({ ...r, [i]: { loading: true } }))
    try {
      await request(API_ENDPOINTS.API_REFERENCES, { method: 'POST', body: { api_def: apiDef } })
      await loadRegistered()
      onChange(items.map((it, idx) => (idx === i ? { ...it, '사용할 API': apiDef.name, _tested: true } : it)))
      setRegs((r) => ({ ...r, [i]: { done: true } }))
    } catch (e) {
      setRegs((r) => ({ ...r, [i]: { error: e.message } }))
    }
  }

  const sharedOptions = (sharedPool || []).map((v) => ({ value: v, label: v }))

  return (
    <div className="mb-4">
      {!single && (
        <>
          <label className="mb-2 block text-sm font-semibold text-[#1F2937]">외부 연동 (선택사항)</label>
          <SectionHelp text={getHelpByName('외부 연동')} />
        </>
      )}
      <div className="space-y-4">
        {items.map((item, i) => {
          const isApi = String(item['연동 방식'] || '').includes('API')
          const sel = item['사용할 API']
          const isNew = !sel || sel === NEW
          const vars = isApi ? (isNew ? extractVars(item) : ((registered.find((r) => r.name === sel)?.api_def?.params || []).map((p) => p.name))) : []
          const test = tests[i] || {}
          const reg = regs[i] || {}
          const hasName = !!String(item['API 이름'] || '').trim()
          const nameErr = isNew ? apiNameError(item['API 이름']) : null
          // '보낼 정보' 선택지에서 이 항목 자신의 '결과를 담을 이름'은 제외(아직 받지 않은 출력값이므로).
          const ownResult = String(item['결과를 담을 이름'] || '').trim()
          const sendOptions = sharedOptions.filter((o) => o.value !== ownResult)
          return (
            <div
              key={i}
              ref={(el) => { blockRefs.current[i] = el }}
              className={`scroll-mt-24 rounded-lg border bg-[#FAFBFC] p-3 transition-shadow ${flashIndex === i ? 'border-[#EF4444] ring-2 ring-[#EF4444]' : 'border-[#E5E7EB]'}`}
            >
              {!single && (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#6B7280]">외부 연동 {i + 1}</span>
                  <Button type="button" variant="danger" size="sm" onClick={() => remove(i)}>삭제</Button>
                </div>
              )}

              {/* 짧은 칸은 2열로 나란히(좁은 화면에선 한 줄씩) */}
              <div className="grid gap-x-4 md:grid-cols-2">
              <FormInput id={`${idBase}-${i}-way`} type="select" label="연동 방식" help={getHelpByName('연동 방식')} value={item['연동 방식'] || ''}
                onChange={(e) => update(i, '연동 방식', e.target.value)}
                options={[{ value: API_WAY, label: API_WAY }, { value: ESD_WAY, label: ESD_WAY }]} required />
              <FormInput id={`${idBase}-${i}-purpose`} type="text" label="연동 목적" help={getHelpByName('연동 목적')} value={item['연동 목적'] || ''}
                onChange={(e) => update(i, '연동 목적', e.target.value)} required />
              </div>
              {/* 고를 변수가 없으면 체크박스 대신 안내 — FormInput은 옵션이 비면 단일 체크박스로 바뀌어 '보낼 정보'에 "on"을 써 버린다. */}
              {sendOptions.length > 0 ? (
                <FormInput id={`${idBase}-${i}-send`} type="checkbox" label="보낼 정보" help={getHelpByName('보낼 정보')} value={Array.isArray(item['보낼 정보']) ? item['보낼 정보'] : []}
                  onChange={(e) => update(i, '보낼 정보', e.target.value)} options={sendOptions} />
              ) : (
                <div className="mb-4">
                  <p className="mb-1 text-sm font-semibold text-[#1F2937]">보낼 정보 <span className="font-normal">(선택사항)</span></p>
                  <p className="text-xs text-[#6B7280]">보낼 수 있는 정보가 아직 없어요. 이 단계 앞에 '정보 받기'나 다른 연동을 두면 그 값이 여기에 떠요.</p>
                </div>
              )}

              {!isApi && (
                <div className="grid gap-x-4 md:grid-cols-2">
                  <FormInput id={`${idBase}-${i}-result`} type="text" label="결과를 담을 이름" help={getHelpByName('결과를 담을 이름')} value={item['결과를 담을 이름'] || ''}
                    onChange={(e) => updateResultName(i, e.target.value)} />
                  <FormInput id={`${idBase}-${i}-esd-receive`} type="text" label="받을 정보 (조회 결과에서 쓸 값, 쉼표로 구분 · 선택)" help={getHelpByName('ESD 받을 정보')}
                    value={Array.isArray(item['받을 정보']) ? item['받을 정보'].join(', ') : (item['받을 정보'] || '')}
                    onChange={(e) => update(i, '받을 정보', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
                </div>
              )}

              {isApi && (
                <div className="mt-2 rounded-md border border-[#DBEAFE] bg-white p-3">
                  <FormInput id={`${idBase}-${i}-useapi`} type="select" label="사용할 API" help={getHelpByName('사용할 API')} required
                    value={sel || NEW} onChange={(e) => update(i, '사용할 API', e.target.value)}
                    options={[...registered.map((r) => ({ value: r.name, label: `${r.name}${r.description ? ` — ${r.description}` : ''}` })), { value: NEW, label: NEW }]} />

                  {isNew && (
                    <div className="mt-2 space-y-1">
                      <div className="grid gap-x-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_9rem]">
                      <FormInput id={`${idBase}-${i}-name`} type="text" label="API 이름(영문)" help={getHelpByName('API 이름')} value={item['API 이름'] || ''} onChange={(e) => update(i, 'API 이름', e.target.value)} error={nameErr} />
                      <FormInput id={`${idBase}-${i}-url`} type="text" label="엔드포인트 URL" help={getHelpByName('엔드포인트 URL')} required value={item['엔드포인트 URL'] || ''} onChange={(e) => update(i, '엔드포인트 URL', e.target.value)} />
                      <FormInput id={`${idBase}-${i}-method`} type="select" label="method" help={getHelpByName('method')} required value={item['method'] || 'GET'} onChange={(e) => update(i, 'method', e.target.value)} options={METHODS.map((m) => ({ value: m, label: m }))} />
                      </div>
                      <KvRows label="헤더" help={getHelpByName('헤더')} rows={item['헤더']} onChange={(v) => update(i, '헤더', v)} optional />
                      {isBodyMethod(item['method'])
                        ? <BodyField item={item} onUpdate={(k, v) => update(i, k, v)} />
                        : <KvRows label="파라미터" help={getHelpByName('파라미터')} rows={item['파라미터']} onChange={(v) => update(i, '파라미터', v)} optional />}
                    </div>
                  )}

                  <FormInput id={`${idBase}-${i}-hint`} type="textarea" label="파라미터 설명 (수집 정보 → API 파라미터 매핑)" help={getHelpByName('파라미터 설명')} value={item['파라미터 설명'] || ''} onChange={(e) => update(i, '파라미터 설명', e.target.value)} />

                  <FormInput id={`${idBase}-${i}-receive`} type="text" label="받을 정보 (응답에서 쓸 값, 쉼표로 구분)" help={getHelpByName('받을 정보')}
                    value={Array.isArray(item['받을 정보']) ? item['받을 정보'].join(', ') : (item['받을 정보'] || '')}
                    onChange={(e) => update(i, '받을 정보', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />

                  {/* 테스트 샘플값 */}
                  {vars.length > 0 && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs font-semibold text-[#6B7280]">테스트 샘플값</p>
                      {vars.map((vn) => (
                        <div key={vn} className="mb-1 flex items-center gap-2">
                          <span className="w-28 text-xs text-[#6B7280]">${`{${vn}}`}</span>
                          <input value={(samples[i] || {})[vn] || ''} onChange={(e) => setSamples((s) => ({ ...s, [i]: { ...(s[i] || {}), [vn]: e.target.value } }))} className="flex-1 rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Button type="button" size="sm" onClick={() => runTest(i)} disabled={test.loading}>
                      {test.loading ? '테스트 중…' : 'API 테스트'}
                    </Button>
                    {item._tested && <span className="text-sm text-[#16A34A]">✓ 테스트 통과</span>}
                    {!item._tested && <span className={`text-xs font-semibold ${flashIndex === i ? 'text-[#DC2626]' : 'text-[#EF4444]'}`}>⚠️ 시나리오에 쓰려면 'API 테스트'를 통과해야 합니다</span>}
                    {/* 직접입력 + 테스트 통과 시 라이브러리 등록 버튼 활성화(자동 등록 안 함) */}
                    {isNew && item._tested && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => registerToLibrary(i)} disabled={reg.loading || !hasName}>
                        {reg.loading ? '등록 중…' : '라이브러리에 등록'}
                      </Button>
                    )}
                    {isNew && item._tested && !hasName && <span className="text-xs text-[#9CA3AF]">등록하려면 API 이름을 입력하세요</span>}
                    {reg.error && <span className="text-xs text-[#EF4444]">등록 실패: {reg.error}</span>}
                  </div>
                  {test.result && (
                    <div className={`mt-2 rounded p-2 text-xs ${test.result.ok ? 'bg-[#F0FDF4] text-[#166534]' : 'bg-[#FEF2F2] text-[#991B1B]'}`}>
                      <div className="font-semibold">{test.result.ok ? `성공 (HTTP ${test.result.status})` : `실패 ${test.result.status ? `(HTTP ${test.result.status})` : ''}`}</div>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap">{String(test.result.body || test.result.error || '').slice(0, 600)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!single && <Button type="button" variant="secondary" size="sm" onClick={add} className="mt-2">+ 외부 연동 추가</Button>}
    </div>
  )
}

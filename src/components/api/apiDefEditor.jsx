// API 정의(api_def) 편집 공통 모듈 — ApiGenPage와 EsdEditor가 함께 사용한다.
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
export const CONTENT_TYPES = ['json', 'form', 'query']

const field = 'w-full rounded-md border border-[#E5E7EB] px-2 py-1 text-sm focus:outline-none focus:border-primary-500'

export function blankDef() {
  return {
    name: '', description: '', method: 'GET', contentType: 'query',
    content: [], headers: [], params: [],
    result: { type: 'json', _error: '', _result: '' },
    url: '', authType: 'noAuth', authParams: {},
  }
}

export function KvEditor({ label, rows, onChange }) {
  const list = Array.isArray(rows) ? rows : []
  const set = (i, k, v) => onChange(list.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[#6B7280]">{label}</label>
      {list.map((r, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <input value={r.key || ''} onChange={(e) => set(i, 'key', e.target.value)} placeholder="key" className="w-1/3 rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
          <input value={r.value || ''} onChange={(e) => set(i, 'value', e.target.value)} placeholder="value" className="flex-1 rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
          <button type="button" onClick={() => onChange(list.filter((_, idx) => idx !== i))} className="px-2 text-sm text-[#EF4444]">×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { key: '', value: '' }])} className="text-xs text-primary-500">+ {label} 추가</button>
    </div>
  )
}

export function ParamEditor({ rows, onChange }) {
  const list = Array.isArray(rows) ? rows : []
  const set = (i, k, v) => onChange(list.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[#6B7280]">파라미터 (경로/쿼리)</label>
      {list.map((r, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <input value={r.name || ''} onChange={(e) => set(i, 'name', e.target.value)} placeholder="name" className="w-1/3 rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
          <input value={r.desc || ''} onChange={(e) => set(i, 'desc', e.target.value)} placeholder="설명" className="flex-1 rounded border border-[#E5E7EB] px-2 py-1 text-sm" />
          <button type="button" onClick={() => onChange(list.filter((_, idx) => idx !== i))} className="px-2 text-sm text-[#EF4444]">×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { name: '', desc: '' }])} className="text-xs text-primary-500">+ 파라미터 추가</button>
    </div>
  )
}

export function ApiDefCard({ def, index, onChange, onRemove }) {
  const set = (patch) => onChange({ ...def, ...patch })
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFBFC] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#6B7280]">API {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-sm text-[#EF4444] hover:underline">삭제</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-semibold text-[#6B7280]">이름(영문)</label>
          <input value={def.name || ''} onChange={(e) => set({ name: e.target.value })} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6B7280]">method</label>
          <select value={def.method || 'GET'} onChange={(e) => set({ method: e.target.value })} className={field}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[#6B7280]">설명</label>
        <input value={def.description || ''} onChange={(e) => set({ description: e.target.value })} className={field} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-semibold text-[#6B7280]">URL</label>
          <input value={def.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://api.example.com/users/${id}" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6B7280]">contentType</label>
          <select value={def.contentType || 'query'} onChange={(e) => set({ contentType: e.target.value })} className={field}>
            {CONTENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <KvEditor label="헤더" rows={def.headers} onChange={(rows) => set({ headers: rows })} />
      <KvEditor label="바디 · 쿼리" rows={def.content} onChange={(rows) => set({ content: rows })} />
      <ParamEditor rows={def.params} onChange={(rows) => set({ params: rows })} />
    </div>
  )
}

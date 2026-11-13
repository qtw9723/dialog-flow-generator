import { useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '../AdminLayout'
import { Card, CardBody } from '../common/Card'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS, SCENARIO_CATEGORIES } from '../../lib/constants'

const emptyForm = { id: null, category: '금융', name: '', description: '', flowText: '' }

// 관리자: 카테고리별 시나리오 레퍼런스 업로드·수정·삭제.
export default function ScenarioReferenceManager() {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('전체')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const { request } = useApi()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await request(API_ENDPOINTS.SCENARIO_REFERENCES)
      setItems(Array.isArray(data) ? data : [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [request])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    setError('')
    if (!form.name.trim()) { setError('이름을 입력해 주세요.'); return }
    let flow_json
    try {
      flow_json = JSON.parse(form.flowText)
      if (!flow_json || typeof flow_json !== 'object') throw new Error()
    } catch { setError('flow_json이 유효한 JSON 객체가 아닙니다.'); return }
    try {
      if (form.id) {
        await request(API_ENDPOINTS.SCENARIO_REFERENCES, { method: 'PATCH', body: { id: form.id, category: form.category, name: form.name.trim(), description: form.description, flow_json } })
      } else {
        await request(API_ENDPOINTS.SCENARIO_REFERENCES, { method: 'POST', body: { category: form.category, name: form.name.trim(), description: form.description, flow_json } })
      }
      setForm(emptyForm)
      await load()
    } catch (e) { setError(e.message) }
  }

  const edit = (it) => setForm({ id: it.id, category: it.category, name: it.name, description: it.description || '', flowText: JSON.stringify(it.flow_json, null, 2) })
  const remove = async (it) => {
    if (!window.confirm(`"${it.name}" 삭제할까요?`)) return
    try { await request(`${API_ENDPOINTS.SCENARIO_REFERENCES}?id=${it.id}`, { method: 'DELETE' }); await load() }
    catch (e) { setError(e.message) }
  }
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => setForm((p) => ({ ...p, flowText: String(r.result) }))
    r.readAsText(f)
  }

  const shown = filter === '전체' ? items : items.filter((i) => i.category === filter)

  return (
    <AdminLayout title="시나리오 레퍼런스">
      <Card>
        <CardBody>
          {/* 작성/수정 폼 */}
          <div className="mb-6 space-y-3">
            <div className="flex gap-3">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm">
                {SCENARIO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="시나리오 이름 (예: 진료 예약)" className="flex-1 rounded-md border border-[#E5E7EB] px-3 py-2 text-sm" />
            </div>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명 (선택)" className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm" />
            <textarea value={form.flowText} onChange={(e) => setForm({ ...form, flowText: e.target.value })} rows={8} placeholder='flow_json (완성 미니봇 JSON 붙여넣기)' className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 font-mono text-xs" />
            <div className="flex items-center gap-3">
              <input type="file" accept="application/json,.json" onChange={onFile} className="text-sm" />
              <div className="ml-auto flex gap-2">
                {form.id && <button onClick={() => setForm(emptyForm)} className="px-4 py-2 text-sm text-[#6B7280]">취소</button>}
                <button onClick={submit} className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600">{form.id ? '수정' : '추가'}</button>
              </div>
            </div>
            {error && <p className="text-sm text-[#EF4444]">{error}</p>}
          </div>

          {/* 필터 + 목록 */}
          <div className="mb-3 flex gap-2 border-t border-[#E5E7EB] pt-4">
            {['전체', ...SCENARIO_CATEGORIES].map((c) => (
              <button key={c} onClick={() => setFilter(c)} className={`rounded-full px-3 py-1 text-xs ${filter === c ? 'bg-primary-500 text-white' : 'bg-[#F1F5F9] text-[#6B7280]'}`}>{c}</button>
            ))}
          </div>
          {loading ? <p className="py-8 text-center text-sm text-[#6B7280]">불러오는 중…</p>
            : shown.length === 0 ? <p className="py-8 text-center text-sm text-[#6B7280]">레퍼런스가 없습니다.</p>
            : (
              <ul className="divide-y divide-[#E5E7EB]">
                {shown.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-3">
                    <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-xs text-primary-500">{it.category}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#1F2937]">{it.name}</p>
                      {it.description && <p className="truncate text-xs text-[#6B7280]">{it.description}</p>}
                    </div>
                    <button onClick={() => edit(it)} className="text-sm text-primary-500 hover:underline">수정</button>
                    <button onClick={() => remove(it)} className="text-sm text-[#EF4444] hover:underline">삭제</button>
                  </li>
                ))}
              </ul>
            )}
        </CardBody>
      </Card>
    </AdminLayout>
  )
}

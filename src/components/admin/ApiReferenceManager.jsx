import { useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '../AdminLayout'
import { Card, CardBody } from '../common/Card'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { parseApiDocToDefs } from '../../lib/parseApiDoc.js'
import { extractFileText } from '../pocDoc/extractFileText'
import { extractApiDefsFromFile } from '../../lib/apiDoc/extractApiDefsFromFile.js'
import { MULTI_INGEST_ACCEPT } from '../../lib/fileAccept.js'

// 관리자: API 레퍼런스(import 형식) 업로드·관리. 배열 파일은 엔드포인트별로 분할 저장됨.
export default function ApiReferenceManager() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [editId, setEditId] = useState(null)
  const { request } = useApi()

  // 문서에서 가져오기 상태
  const [docOpen, setDocOpen] = useState(false)
  const [docRaw, setDocRaw] = useState('')
  const [docError, setDocError] = useState('')
  const [docPreview, setDocPreview] = useState([])
  const [docFileLoading, setDocFileLoading] = useState(false)
  const [docSource, setDocSource] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await request(API_ENDPOINTS.API_REFERENCES)
      setItems(Array.isArray(data) ? data : [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [request])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    setError('')
    let parsed
    try { parsed = JSON.parse(text); if (!parsed || typeof parsed !== 'object') throw new Error() }
    catch { setError('유효한 JSON(단일 정의 또는 배열)이 아닙니다.'); return }
    try {
      if (editId) {
        const def = Array.isArray(parsed) ? parsed[0] : parsed
        await request(API_ENDPOINTS.API_REFERENCES, { method: 'PATCH', body: { id: editId, api_def: def } })
      } else {
        await request(API_ENDPOINTS.API_REFERENCES, { method: 'POST', body: { api_def: parsed } })
      }
      setText(''); setEditId(null); await load()
    } catch (e) { setError(e.message) }
  }

  const edit = (it) => { setEditId(it.id); setText(JSON.stringify(it.api_def, null, 2)) }
  const remove = async (it) => {
    if (!window.confirm(`"${it.name}" 삭제할까요?`)) return
    try { await request(`${API_ENDPOINTS.API_REFERENCES}?id=${it.id}`, { method: 'DELETE' }); await load() }
    catch (e) { setError(e.message) }
  }
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onload = () => setText(String(r.result)); r.readAsText(f)
  }

  // 문서에서 가져오기 — OpenAPI 3.x JSON/YAML 파싱(공용 모듈 재사용)
  const parseOpenApiDoc = () => {
    const { defs, error } = parseApiDocToDefs(docRaw)
    setDocError(error)
    setDocPreview(defs)
  }

  const applyDocPreview = () => {
    setText(JSON.stringify(docPreview, null, 2))
    setEditId(null)
    setDocOpen(false)
    setDocRaw(''); setDocPreview([]); setDocError('')
  }

  const onDocFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    setDocFileLoading(true); setDocError(''); setDocPreview([]); setDocSource(null)
    const callApiDocParse = (text) => request(API_ENDPOINTS.API_DOC_PARSE, { method: 'POST', body: { text }, loadingMessage: 'API 추출 중…' })
    try {
      const { defs, source, error } = await extractApiDefsFromFile(f, { extractText: extractFileText, callApiDocParse })
      if (error) { setDocError(error); return }
      setDocPreview(defs)
      setDocSource(source)
    } catch (err) {
      setDocError(err?.message || 'API 추출 중 오류가 발생했습니다.')
    } finally {
      setDocFileLoading(false)
    }
  }

  return (
    <AdminLayout title="API 레퍼런스">
      <Card>
        <CardBody>
          {/* 문서에서 가져오기 섹션 */}
          <div className="mb-4 rounded-md border border-[#E5E7EB]">
            <button
              onClick={() => { setDocOpen(!docOpen); setDocError(''); setDocPreview([]); setDocSource(null) }}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#1F2937] hover:bg-[#F9FAFB]"
            >
              <span>문서에서 가져오기 (OpenAPI · 워드 · PDF · 엑셀 · 텍스트)</span>
              <span className="text-[#6B7280]">{docOpen ? '▲' : '▼'}</span>
            </button>

            {docOpen && (
              <div className="border-t border-[#E5E7EB] px-4 py-4 space-y-3">
                <p className="text-sm text-[#6B7280]">
                  API 문서(OpenAPI JSON/YAML · PDF · 엑셀 · 텍스트)를 붙여넣거나 파일을 업로드하세요.
                  미리보기를 확인하고 "등록 텍스트로 가져오기"를 누르면 아래 등록 폼에 주입됩니다.
                </p>
                <textarea
                  value={docRaw}
                  onChange={(e) => setDocRaw(e.target.value)}
                  rows={8}
                  placeholder={'openapi: "3.0.0"\ninfo:\n  title: My API\npaths:\n  /users:\n    get:\n      operationId: listUsers\n      summary: 사용자 목록'}
                  className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 font-mono text-xs"
                />
                <div className="flex items-center gap-3">
                  <input type="file" accept={MULTI_INGEST_ACCEPT} onChange={onDocFile} disabled={docFileLoading} className="text-sm" />
                  {docFileLoading && <span className="text-xs text-[#6B7280]">추출 중…</span>}
                  <button
                    onClick={parseOpenApiDoc}
                    disabled={!docRaw.trim()}
                    className="ml-auto rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    파싱
                  </button>
                </div>
                {docError && <p className="text-sm text-[#EF4444]">{docError}</p>}

                {docPreview.length > 0 && (
                  <div className="rounded-md border border-[#E5E7EB] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[#1F2937]">
                        미리보기 — {docPreview.length}개 엔드포인트
                        {docSource && (
                          <span className="ml-2 rounded bg-primary-50 px-1.5 py-0.5 text-xs font-normal text-primary-500">
                            {docSource === 'openapi' ? 'OpenAPI 결정론' : '문서(LLM)'}
                          </span>
                        )}
                      </p>
                      <button
                        onClick={applyDocPreview}
                        className="rounded-md bg-[#16A34A] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#15803D]"
                      >
                        등록 텍스트로 가져오기
                      </button>
                    </div>
                    <ul className="divide-y divide-[#F3F4F6] max-h-64 overflow-y-auto">
                      {docPreview.map((def, i) => (
                        <li key={i} className="flex items-start gap-2 py-2 text-sm">
                          <span className="mt-0.5 shrink-0 rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs font-mono uppercase text-[#6B7280]">{def.method}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-[#1F2937] truncate">{def.name}</p>
                            {def.description && <p className="truncate text-xs text-[#6B7280]">{def.description}</p>}
                            <p className="truncate text-xs text-[#9CA3AF] font-mono">{def.url}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 기존 직접 입력 / 등록 폼 */}
          <div className="mb-6 space-y-3">
            <p className="text-sm text-[#6B7280]">
              API import 형식 JSON을 붙여넣거나 .json 파일을 올리세요. <b>배열</b>이면 엔드포인트별로 나눠 저장됩니다.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder='[{"name":"openEMR_patient","description":"...","method":"get","url":"...", ...}]'
              className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 font-mono text-xs"
            />
            <div className="flex items-center gap-3">
              <input type="file" accept="application/json,.json" onChange={onFile} className="text-sm" />
              <div className="ml-auto flex gap-2">
                {editId && <button onClick={() => { setEditId(null); setText('') }} className="px-4 py-2 text-sm text-[#6B7280]">취소</button>}
                <button onClick={submit} className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600">{editId ? '수정' : '추가'}</button>
              </div>
            </div>
            {error && <p className="text-sm text-[#EF4444]">{error}</p>}
          </div>

          <div className="border-t border-[#E5E7EB] pt-4">
            {loading ? <p className="py-8 text-center text-sm text-[#6B7280]">불러오는 중…</p>
              : items.length === 0 ? <p className="py-8 text-center text-sm text-[#6B7280]">등록된 API 레퍼런스가 없습니다.</p>
              : (
                <ul className="divide-y divide-[#E5E7EB]">
                  {items.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 py-3">
                      <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-xs font-mono uppercase text-[#6B7280]">{it.method || '-'}</span>
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
          </div>
        </CardBody>
      </Card>
    </AdminLayout>
  )
}

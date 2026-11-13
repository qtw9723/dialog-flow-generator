import { useState } from 'react'
import { downloadJson, downloadText, downloadCsv, downloadBlob } from '../../lib/downloadFile.js'
import PageHeader from '../ui/PageHeader'
import { Card } from '../common/Card'
import { Button } from '../common/Button'
import StepBar from '../ui/StepBar'
import UploadZone from '../ui/UploadZone'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { parseApiDocToDefs } from '../../lib/parseApiDoc.js'
import { extractFileText } from '../pocDoc/extractFileText'
import { extractApiDefsFromFile } from '../../lib/apiDoc/extractApiDefsFromFile.js'
import { MULTI_INGEST_ACCEPT } from '../../lib/fileAccept.js'
import { blankDef, KvEditor, ParamEditor, ApiDefCard } from './apiDefEditor.jsx'

// 부가 도구: 문서 → API 생성.
// ESD 변환과 동일한 흐름 — ① 문서 입력(업로드/붙여넣기) → ② 추출된 API들을 검토·수정 → JSON 파일 저장.
// 문서에 여러 API가 있으면 여러 개를 만든다. 다형식(OpenAPI JSON/YAML·엑셀·PDF·텍스트) 입력을 받는다.
//   OpenAPI 3.x → 결정론 파서(parseApiDocToDefs), 그 외 자유형식 → LLM 엣지함수(api-doc-parse).

const STEPS = ['문서 입력', 'API 검토 · 수정 · 저장']

export default function ApiGenPage() {
  const { request } = useApi()
  const [step, setStep] = useState('input') // 'input' | 'review'
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [defs, setDefs] = useState([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [apiDocSource, setApiDocSource] = useState(null)

  const goReview = (list) => { setDefs(list); setCopied(false); setStep('review') }

  const generate = async () => {
    setError('')
    const trimmed = raw.trim()
    if (!trimmed) { setError('문서를 붙여넣거나 파일을 업로드하세요.'); return }

    // 1) OpenAPI 3.x → 결정론 파서 우선
    const det = parseApiDocToDefs(trimmed)
    if (det.defs.length) { goReview(det.defs); return }

    // 2) 자유형식 문서 → LLM 추출
    setGenerating(true)
    try {
      const res = await request(API_ENDPOINTS.API_DOC_PARSE, { method: 'POST', body: { text: trimmed }, loadingMessage: 'API 추출 중…' })
      const got = Array.isArray(res?.defs) ? res.defs : []
      if (!got.length) {
        setError('문서에서 API를 추출하지 못했습니다. 내용을 확인하거나 더 구체적으로 작성해보세요.')
        return
      }
      goReview(got)
    } catch (e) {
      setError(e?.message || '생성 중 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const onFile = async (f) => {
    setError(''); setFileName(f.name); setExtracting(true); setApiDocSource(null)
    const callApiDocParse = (text) => request(API_ENDPOINTS.API_DOC_PARSE, { method: 'POST', body: { text }, loadingMessage: 'API 추출 중…' })
    try {
      const { defs, source, error: extractError } = await extractApiDefsFromFile(f, { extractText: extractFileText, callApiDocParse })
      if (extractError || !defs.length) {
        setError(extractError || '파일에서 API를 추출하지 못했습니다.')
        setFileName('')
        return
      }
      setApiDocSource(source)
      goReview(defs)
    } catch (e) {
      setError(e?.message || '파일에서 API를 추출하지 못했습니다.')
      setFileName('')
    } finally {
      setExtracting(false)
    }
  }

  const patchAt = (i) => (next) => setDefs(defs.map((d, idx) => (idx === i ? next : d)))
  const removeAt = (i) => setDefs(defs.filter((_, idx) => idx !== i))
  const addDef = () => setDefs([...defs, blankDef()])

  const json = defs.length ? JSON.stringify(defs, null, 2) : ''

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('클립보드 복사에 실패했습니다. 아래 JSON을 직접 선택해 복사하세요.')
    }
  }

  const download = () => downloadText('api_def.json', json, 'application/json')

  return (
    <div>
      <PageHeader
        title="문서 → API 생성"
        description="API 문서를 올리면 그 안의 API들을 추출합니다. 검토·수정한 뒤 api_def JSON 파일로 저장하세요."
      />

      <StepBar steps={STEPS} currentIndex={step === 'input' ? 0 : 1} />

      {step === 'input' && (
        <Card className="p-6 space-y-3">
          <label className="block text-sm font-medium text-[#1F2937]">API 문서</label>

          <UploadZone
            onFile={onFile}
            accept={MULTI_INGEST_ACCEPT}
            hint="OpenAPI(JSON/YAML) · 워드 · 엑셀 · PDF · 텍스트"
            loading={extracting}
          />
          {fileName && !extracting && (
            <p className="text-xs text-[#6B7280]">불러온 파일: <span className="font-medium text-[#1F2937]">{fileName}</span></p>
          )}

          <div className="py-1 text-center">
            <span className="text-xs text-[#9CA3AF]">또는 직접 붙여넣기</span>
          </div>

          <textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setFileName('') }}
            rows={12}
            placeholder={'OpenAPI 문서를 붙여넣거나, API가 설명된 문서(엑셀·PDF·텍스트)를 위에서 업로드하세요.'}
            className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary-500"
          />
          <div className="flex justify-end">
            <Button onClick={generate} disabled={!raw.trim() || extracting || generating}>
              {generating ? '추출 중…' : 'API 추출'}
            </Button>
          </div>
          {error && <p className="text-sm text-[#EF4444]">{error}</p>}
        </Card>
      )}

      {step === 'review' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#1F2937]">
              추출된 API {defs.length}개 — 확인하고 수정하세요
              {apiDocSource && (
                <span className="ml-2 rounded bg-primary-50 px-1.5 py-0.5 text-xs font-normal text-primary-500">
                  {apiDocSource === 'openapi' ? 'OpenAPI 결정론' : '문서(LLM)'}
                </span>
              )}
            </p>
            <Button variant="outline" onClick={addDef}>+ API 추가</Button>
          </div>

          {defs.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#6B7280]">API가 없습니다. "+ API 추가"로 직접 만들거나 다시 입력하세요.</p>
          ) : (
            <div className="space-y-3">
              {defs.map((d, i) => (
                <ApiDefCard key={i} def={d} index={i} onChange={patchAt(i)} onRemove={() => removeAt(i)} />
              ))}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#6B7280]">미리보기 — api_def JSON</label>
            <textarea
              readOnly
              value={json}
              rows={10}
              className="w-full rounded-md border border-[#E5E7EB] bg-[#FAFBFC] px-3 py-2 font-mono text-xs"
            />
          </div>

          {error && <p className="text-sm text-[#EF4444]">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" onClick={() => { setStep('input'); setError(''); setApiDocSource(null) }}>← 다시 입력</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyJson} disabled={!defs.length}>
                {copied ? '복사됨 ✓' : 'JSON 복사'}
              </Button>
              <Button onClick={download} disabled={!defs.length}>
                JSON 파일로 저장
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

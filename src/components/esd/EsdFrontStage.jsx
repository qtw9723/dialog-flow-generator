import { useState, useRef } from 'react'
import EsdEditor from './EsdEditor.jsx'
import { validateEsdDraft } from '../../lib/esdValidation.js'
import { buildEsdJson } from '../../lib/buildEsdJson.js'
import { esdFromDocuments } from '../../lib/esdFromDocuments.js'
import { getFileSheetNames, parseFileSheet } from '../../lib/parseExcelFile.js'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { extractFileText } from '../pocDoc/extractFileText'
import { extractApiDefsFromFile } from '../../lib/apiDoc/extractApiDefsFromFile.js'
import { SPREADSHEET_ACCEPT, MULTI_INGEST_ACCEPT } from '../../lib/fileAccept.js'

// EsdSchema[] (빌드 형식) → validateEsdDraft / buildEsdJson 입력 형식으로 역변환.
function esdSchemaToRaw(entities) {
  return (entities || []).map((e) => ({
    schemaName: e.name,
    createdAt: e.createdAt || new Date().toISOString(),
    fields: (e.fields || []).map((f) => ({ name: f.name, type: f.type, key: f.key, crypt: f.crypt })),
  }))
}

function FilePickerButton({ accept, label, disabled, onFile }) {
  const inputRef = useRef(null)
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-primary-500 px-3 py-1.5 text-xs font-medium text-primary-500 hover:bg-blue-50 disabled:opacity-50"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }}
      />
    </>
  )
}

/**
 * ESD 선행 저작·확정 패널.
 * 탭 ⓐ 직접입력 / ⓑ 문서업로드 → EsdEditor로 초안 편집 → 확정 시 validateEsdDraft + buildEsdJson → onConfirm.
 *
 * @param {{ initialEsdJson?: object, onConfirm: (esdJson: object) => void, onCancel?: () => void }} props
 */
export default function EsdFrontStage({ initialEsdJson, onConfirm, onCancel }) {
  const [tab, setTab] = useState('direct')
  const [showEditor, setShowEditor] = useState(false)
  const [draftEsdJson, setDraftEsdJson] = useState(initialEsdJson || null)
  const [banner, setBanner] = useState('')
  const [uploadMsg, setUploadMsg] = useState('')
  const [excelLoading, setExcelLoading] = useState(false)
  const [apiDocLoading, setApiDocLoading] = useState(false)
  const { request } = useApi()

  const entityCount = draftEsdJson?.entities?.length ?? 0
  const apiCount = draftEsdJson?.apis?.length ?? 0

  const handleEditorSave = (esdJson) => {
    setDraftEsdJson(esdJson)
    setShowEditor(false)
  }

  const handleConfirm = () => {
    const rawEntities = esdSchemaToRaw(draftEsdJson?.entities)
    const err = validateEsdDraft(rawEntities)
    if (err) { setBanner(err); return }
    setBanner('')
    const esdJson = buildEsdJson({ entities: rawEntities, apis: draftEsdJson?.apis || [] })
    onConfirm(esdJson)
  }

  const handleExcelFile = async (file) => {
    setExcelLoading(true)
    setUploadMsg('')
    try {
      const sheetNames = await getFileSheetNames(file)
      const { headers, rows } = await parseFileSheet(file, sheetNames[0])
      const stemName = file.name.replace(/\.[^/.]+$/, '')
      const generated = esdFromDocuments({ sheets: [{ schemaName: stemName, headers, rows }], apis: [] })
      setDraftEsdJson((prev) => ({
        entities: [...(prev?.entities || []), ...generated.entities],
        apis: prev?.apis || [],
      }))
      setUploadMsg(`엑셀 "${file.name}" → 스키마 "${stemName}" 추가됨.`)
    } catch (e) {
      setUploadMsg(`엑셀 읽기 오류: ${e.message}`)
    } finally {
      setExcelLoading(false)
    }
  }

  const handleApiDocFile = async (file) => {
    setApiDocLoading(true)
    setUploadMsg('')
    const callApiDocParse = (text) => request(API_ENDPOINTS.API_DOC_PARSE, { method: 'POST', body: { text }, loadingMessage: 'API 추출 중…' })
    try {
      const { defs, source, error } = await extractApiDefsFromFile(file, { extractText: extractFileText, callApiDocParse })
      if (error) { setUploadMsg(`API 추출 오류: ${error}`); return }
      setDraftEsdJson((prev) => ({
        entities: prev?.entities || [],
        apis: [...(prev?.apis || []), ...defs],
      }))
      const srcLabel = source === 'openapi' ? 'OpenAPI 결정론' : '문서(LLM)'
      setUploadMsg(`"${file.name}" → API ${defs.length}개 추가됨 [${srcLabel}]`)
    } catch (e) {
      setUploadMsg(`API 추출 오류: ${e.message}`)
    } finally {
      setApiDocLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      {/* 탭 바 */}
      <div className="flex border-b border-[#E5E7EB]">
        {[['direct', 'ⓐ 직접입력'], ['upload', 'ⓑ 문서업로드']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-6 py-5 space-y-4">
        {banner && (
          <div className="rounded-md bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-sm text-[#DC2626]">
            {banner}
          </div>
        )}

        {/* 탭 ⓐ 직접입력 */}
        {tab === 'direct' && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">
              ESD 에디터를 열어 스키마·필드·타입·키·암호화를 직접 편집합니다.
            </p>
            <button
              onClick={() => setShowEditor(true)}
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              {entityCount > 0 ? 'ESD·API 편집' : 'ESD·API 편집 시작'}
            </button>
          </div>
        )}

        {/* 탭 ⓑ 문서업로드 */}
        {tab === 'upload' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6B7280]">엑셀 → 스키마 초안</p>
                <p className="text-xs text-[#9CA3AF]">.xlsx / .xls / .csv 첫 번째 시트를 스키마로 파싱합니다.</p>
                <FilePickerButton
                  accept={SPREADSHEET_ACCEPT}
                  label={excelLoading ? '파싱 중…' : '엑셀 파일 선택'}
                  disabled={excelLoading}
                  onFile={handleExcelFile}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6B7280]">API 문서 → API 초안</p>
                <p className="text-xs text-[#9CA3AF]">OpenAPI·워드·PDF·엑셀·텍스트 등 API 문서에서 API 정의를 추출합니다.</p>
                <FilePickerButton
                  accept={MULTI_INGEST_ACCEPT}
                  label={apiDocLoading ? '추출 중…' : 'API 문서 파일 선택'}
                  disabled={apiDocLoading}
                  onFile={handleApiDocFile}
                />
              </div>
            </div>
            {uploadMsg && (
              <p className={`text-xs ${uploadMsg.includes('오류') ? 'text-[#EF4444]' : 'text-[#059669]'}`}>
                {uploadMsg}
              </p>
            )}
            {entityCount > 0 && (
              <button
                onClick={() => setShowEditor(true)}
                className="rounded-md border border-primary-500 px-4 py-2 text-sm font-medium text-primary-500 hover:bg-blue-50"
              >
                초안 편집
              </button>
            )}
          </div>
        )}

        {/* 현재 초안 요약 */}
        {(entityCount > 0 || apiCount > 0) && (
          <div className="rounded-md bg-[#F0F7FF] border border-[#BFDBFE] px-4 py-3 text-sm text-[#1E40AF]">
            현재 초안: 스키마 {entityCount}개{apiCount > 0 ? `, API ${apiCount}개` : ''}
          </div>
        )}
      </div>

      {/* 확정 / 취소 */}
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#E5E7EB]">
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#1F2937]">
            취소
          </button>
        )}
        <button
          onClick={handleConfirm}
          disabled={entityCount === 0}
          className="rounded-md bg-primary-500 px-5 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          확정
        </button>
      </div>

      {/* EsdEditor 모달 (직접입력·초안 편집 공용) */}
      {showEditor && (
        <EsdEditor
          initialEsdJson={draftEsdJson}
          onSave={handleEditorSave}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  )
}

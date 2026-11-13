import { useState, useRef } from 'react'
import { buildEsdJson } from '../../lib/buildEsdJson.js'
import { validateEsdDraft } from '../../lib/esdValidation.js'
import { ESD_TYPES } from '../../lib/esdFieldRules.js'
import { getFileSheetNames, parseFileSheet } from '../../lib/parseExcelFile.js'
import { inferEsdFields } from '../../lib/inferEsdFields.js'
import { ApiDefCard, blankDef } from '../api/apiDefEditor.jsx'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { extractFileText } from '../pocDoc/extractFileText'
import { extractApiDefsFromFile } from '../../lib/apiDoc/extractApiDefsFromFile.js'
import { SPREADSHEET_ACCEPT, MULTI_INGEST_ACCEPT } from '../../lib/fileAccept.js'

let _uid = 0
function uid() { return `_${++_uid}` }

function blankField() {
  return { _id: uid(), name: '', type: 'string', key: false, crypt: 'false' }
}

function blankEntity() {
  return { _id: uid(), schemaName: '', createdAt: new Date().toISOString(), fields: [blankField()] }
}

function esdJsonToEditorEntities(entities) {
  return (entities || []).map((e) => ({
    _id: uid(),
    schemaName: e.name || '',
    createdAt: e.createdAt || new Date().toISOString(),
    fields: (e.fields || []).map((f) => ({
      _id: uid(),
      name: f.name || '',
      type: f.type || 'string',
      key: f.key === true,
      crypt: f.crypt === 'true' ? 'true' : 'false',
    })),
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

function EntityCard({ entity, onRemove, onPatch, onAddField, onRemoveField, onPatchField }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB] rounded-t-lg">
        <input
          value={entity.schemaName}
          onChange={(e) => onPatch({ schemaName: e.target.value })}
          placeholder="스키마 이름 (필수)"
          className="flex-1 rounded border border-[#E5E7EB] px-2 py-1.5 text-sm font-medium focus:outline-none focus:border-primary-500"
        />
        <button onClick={onRemove} className="text-sm text-[#EF4444] hover:underline shrink-0">
          삭제
        </button>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-[1fr_100px_44px_44px_28px] gap-2 mb-2 text-xs font-semibold text-[#6B7280]">
          <span>필드명</span>
          <span>타입</span>
          <span className="text-center">🔑 키</span>
          <span className="text-center">🔒 암호화</span>
          <span />
        </div>

        {entity.fields.length === 0 ? (
          <p className="py-2 text-xs text-[#9CA3AF]">필드가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {entity.fields.map((field) => (
              <div key={field._id} className="grid grid-cols-[1fr_100px_44px_44px_28px] gap-2 items-center">
                <input
                  value={field.name}
                  onChange={(e) => onPatchField(field._id, { name: e.target.value })}
                  placeholder="필드명"
                  className="rounded border border-[#E5E7EB] px-2 py-1 text-sm focus:outline-none focus:border-primary-500"
                />
                <select
                  value={field.type}
                  onChange={(e) => onPatchField(field._id, { type: e.target.value })}
                  className="rounded border border-[#E5E7EB] px-1 py-1 text-sm focus:outline-none focus:border-primary-500"
                >
                  {ESD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={field.key === true}
                    onChange={(e) => onPatchField(field._id, { key: e.target.checked })}
                    className="h-4 w-4 cursor-pointer"
                  />
                </div>
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={field.crypt === 'true'}
                    onChange={(e) => onPatchField(field._id, { crypt: e.target.checked ? 'true' : 'false' })}
                    className="h-4 w-4 cursor-pointer"
                  />
                </div>
                <button
                  onClick={() => onRemoveField(field._id)}
                  className="text-sm text-[#EF4444] text-center leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onAddField}
          className="mt-3 text-xs text-primary-500 hover:underline"
        >
          + 필드 추가
        </button>
      </div>
    </div>
  )
}

/**
 * ESD·API 편집기 — 스키마/필드 표, API 카드, "문서에서 만들기", 검증·조립 후 저장.
 * 결과에 번들된 ESD(generation_tiers.esd) 편집용. 저장은 상위가 넘긴 onSave(esd_json)로 위임(결과 PATCH 등).
 *
 * @param {{ initialEsdJson: object|null, onSave: Function, onClose: Function, title?: string }} props
 */
export default function EsdEditor({ initialEsdJson, onSave, onClose, title = 'ESD·API 편집' }) {
  const [entities, setEntities] = useState(() =>
    initialEsdJson?.entities?.length > 0
      ? esdJsonToEditorEntities(initialEsdJson.entities)
      : []
  )
  const [apis, setApis] = useState(() => initialEsdJson?.apis || [])

  const [validError, setValidError] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)
  const [apiDocLoading, setApiDocLoading] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const { request } = useApi()

  // Entity operations
  const addEntity = () => setEntities((prev) => [...prev, blankEntity()])
  const removeEntity = (id) => setEntities((prev) => prev.filter((e) => e._id !== id))
  const patchEntity = (id, patch) =>
    setEntities((prev) => prev.map((e) => (e._id === id ? { ...e, ...patch } : e)))

  // Field operations
  const addField = (entityId) =>
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId ? { ...e, fields: [...e.fields, blankField()] } : e
      )
    )
  const removeField = (entityId, fieldId) =>
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId ? { ...e, fields: e.fields.filter((f) => f._id !== fieldId) } : e
      )
    )
  const patchField = (entityId, fieldId, patch) =>
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? { ...e, fields: e.fields.map((f) => (f._id === fieldId ? { ...f, ...patch } : f)) }
          : e
      )
    )

  // API operations
  const addApi = () => setApis((prev) => [...prev, blankDef()])
  const removeApi = (i) => setApis((prev) => prev.filter((_, idx) => idx !== i))
  const patchApi = (i) => (next) => setApis((prev) => prev.map((d, idx) => (idx === i ? next : d)))

  // "문서에서 만들기" — Excel → entities 초안
  const onExcelFile = async (file) => {
    setExcelLoading(true)
    setImportMsg('')
    try {
      const sheetNames = await getFileSheetNames(file)
      const sheetName = sheetNames[0]
      const { headers, rows } = await parseFileSheet(file, sheetName)
      const fieldSpecs = inferEsdFields({ headers, rows })
      const specKeys = Object.keys(fieldSpecs)
      const stemName = file.name.replace(/\.[^/.]+$/, '')
      const newEntity = {
        _id: uid(),
        schemaName: stemName,
        createdAt: new Date().toISOString(),
        fields: specKeys.map((h) => ({
          _id: uid(),
          name: h,
          type: fieldSpecs[h].type || 'string',
          key: fieldSpecs[h].key === true,
          crypt: fieldSpecs[h].crypt === 'true' ? 'true' : 'false',
        })),
      }
      setEntities((prev) => [...prev, newEntity])
      setImportMsg(`엑셀 "${file.name}" → 스키마 "${stemName}" (${specKeys.length}개 필드) 추가됨.`)
    } catch (e) {
      setImportMsg(`엑셀 읽기 오류: ${e.message}`)
    } finally {
      setExcelLoading(false)
    }
  }

  // "문서에서 만들기" — API 문서(OpenAPI·PDF·엑셀 등) → apis 초안
  const onApiDocFile = async (file) => {
    setApiDocLoading(true)
    setImportMsg('')
    const callApiDocParse = (text) => request(API_ENDPOINTS.API_DOC_PARSE, { method: 'POST', body: { text }, loadingMessage: 'API 추출 중…' })
    try {
      const { defs, source, error } = await extractApiDefsFromFile(file, { extractText: extractFileText, callApiDocParse })
      if (error) { setImportMsg(`API 추출 오류: ${error}`); return }
      setApis((prev) => [...prev, ...defs])
      const srcLabel = source === 'openapi' ? 'OpenAPI 결정론' : '문서(LLM)'
      setImportMsg(`"${file.name}" → API ${defs.length}개 추가됨 [${srcLabel}]`)
    } catch (e) {
      setImportMsg(`API 추출 오류: ${e.message}`)
    } finally {
      setApiDocLoading(false)
    }
  }

  // 저장: 검증 → buildEsdJson → onSave(esd_json) (상위가 결과 PATCH로 저장)
  const handleSave = async () => {
    const plainEntities = entities.map((e) => ({
      schemaName: e.schemaName,
      createdAt: e.createdAt,
      fields: e.fields.map((f) => ({ name: f.name, type: f.type, key: f.key, crypt: f.crypt })),
    }))

    const err = validateEsdDraft(plainEntities)
    if (err) { setValidError(err); return }

    setValidError('')
    setSaveLoading(true)
    try {
      const esd_json = buildEsdJson({ entities: plainEntities, apis })
      await onSave(esd_json)
      onClose()
    } catch (e) {
      setValidError(e.message)
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-start justify-center pt-8 pb-16 px-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-base font-semibold text-[#1F2937]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-[#6B7280] hover:text-[#1F2937] text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {validError && (
            <div className="rounded-md bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-sm text-[#DC2626]">
              {validError}
            </div>
          )}

          {/* 스키마 섹션 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#1F2937]">스키마 ({entities.length})</h3>
              <button
                onClick={addEntity}
                className="rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600"
              >
                + 스키마 추가
              </button>
            </div>

            {entities.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#9CA3AF] border border-dashed border-[#E5E7EB] rounded-lg">
                스키마가 없습니다. 추가하거나 아래 "문서에서 만들기"를 사용하세요.
              </p>
            ) : (
              <div className="space-y-4">
                {entities.map((entity) => (
                  <EntityCard
                    key={entity._id}
                    entity={entity}
                    onRemove={() => removeEntity(entity._id)}
                    onPatch={(patch) => patchEntity(entity._id, patch)}
                    onAddField={() => addField(entity._id)}
                    onRemoveField={(fid) => removeField(entity._id, fid)}
                    onPatchField={(fid, patch) => patchField(entity._id, fid, patch)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* API 섹션 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#1F2937]">API 정의 ({apis.length})</h3>
              <button
                onClick={addApi}
                className="rounded-md border border-primary-500 px-3 py-1.5 text-xs font-medium text-primary-500 hover:bg-blue-50"
              >
                + API 추가
              </button>
            </div>

            {apis.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#9CA3AF] border border-dashed border-[#E5E7EB] rounded-lg">
                API 정의가 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {apis.map((d, i) => (
                  <ApiDefCard
                    key={i}
                    def={d}
                    index={i}
                    onChange={patchApi(i)}
                    onRemove={() => removeApi(i)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 문서에서 만들기 */}
          <section className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4 space-y-4">
            <h3 className="text-sm font-semibold text-[#1F2937]">문서에서 만들기</h3>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6B7280]">엑셀 → 스키마 초안</p>
                <p className="text-xs text-[#9CA3AF]">
                  .xlsx / .xls / .csv 업로드 시 첫 번째 시트를 파싱해 스키마를 추가합니다.
                </p>
                <FilePickerButton
                  accept={SPREADSHEET_ACCEPT}
                  label={excelLoading ? '파싱 중…' : '엑셀 파일 선택'}
                  disabled={excelLoading}
                  onFile={onExcelFile}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6B7280]">API 문서 → API 초안</p>
                <p className="text-xs text-[#9CA3AF]">
                  OpenAPI·워드·PDF·엑셀·텍스트 등 API 문서 업로드 시 API 정의를 추가합니다.
                </p>
                <FilePickerButton
                  accept={MULTI_INGEST_ACCEPT}
                  label={apiDocLoading ? '추출 중…' : 'API 문서 파일 선택'}
                  disabled={apiDocLoading}
                  onFile={onApiDocFile}
                />
              </div>
            </div>

            {importMsg && (
              <p className={`text-xs ${importMsg.includes('오류') ? 'text-[#EF4444]' : 'text-[#059669]'}`}>
                {importMsg}
              </p>
            )}
          </section>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#E5E7EB]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#1F2937]">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saveLoading}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {saveLoading ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

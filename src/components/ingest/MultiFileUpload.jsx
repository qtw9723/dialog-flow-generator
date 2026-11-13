import { useState, useRef, useCallback } from 'react'
import { classifyFiles } from '../../lib/ingest/classifyFiles.js'
import { extractFileText } from '../pocDoc/extractFileText'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { MULTI_INGEST_ACCEPT } from '../../lib/fileAccept.js'

const KIND_LABELS = { esd: 'ESD', api: 'API', scenario: '시나리오', ambiguous: '불명확' }
const KIND_CYCLE = ['esd', 'api', 'scenario', 'ambiguous']

const KIND_BADGE_STYLES = {
  esd: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200',
  api: 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200',
  scenario: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200',
  ambiguous: 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200',
}

function KindBadge({ kind, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="클릭해 kind 변경"
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium cursor-pointer transition-colors ${KIND_BADGE_STYLES[kind] ?? KIND_BADGE_STYLES.ambiguous}`}
    >
      {KIND_LABELS[kind] ?? kind}
    </button>
  )
}

/**
 * 다중 파일 드롭/선택 UI.
 * 각 파일에 kind 배지를 표시하고, ambiguous 파일은 ingest-classify로 재판정한다.
 * 배지 클릭으로 kind 수동 재지정 가능.
 *
 * @param {{ onChange?: (result: {files: Array<{file: File, name: string, kind: string, reason: string}>}) => void, onFilesRouted?: Function, disabled?: boolean }} props
 */
export function MultiFileUpload({ onChange, onFilesRouted, disabled = false }) {
  const { request } = useApi()
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  // entries: Array<{ file: File, name: string, kind: string, reason: string, error?: string }>
  const [entries, setEntries] = useState([])
  const [classifying, setClassifying] = useState(false)
  const [classifyNotice, setClassifyNotice] = useState(null)

  const notifyChange = useCallback((nextEntries) => {
    onChange?.({ files: nextEntries.map(({ file, name, kind, reason }) => ({ file, name, kind, reason })) })
  }, [onChange])

  const classifyAndSet = useCallback(async (newFiles) => {
    setClassifying(true)
    setClassifyNotice(null)

    // 1. 텍스트 추출 및 휴리스틱 분류
    const extracted = await Promise.all(
      newFiles.map(async (file) => {
        try {
          const textContent = await extractFileText(file)
          return { file, name: file.name, textContent, error: null }
        } catch (err) {
          return { file, name: file.name, textContent: '', error: err.message || '텍스트 추출 실패' }
        }
      })
    )

    const { files: classified } = classifyFiles(
      extracted.map(({ name, textContent }) => ({ name, textContent }))
    )

    const initialEntries = extracted.map((e, i) => ({
      file: e.file,
      name: e.name,
      kind: e.error ? 'ambiguous' : classified[i].kind,
      reason: e.error ? e.error : classified[i].reason,
      error: e.error ?? null,
    }))

    // 2. ambiguous 파일은 LLM 재판정
    const ambiguousIndices = initialEntries
      .map((entry, idx) => ({ entry, idx }))
      .filter(({ entry }) => entry.kind === 'ambiguous' && !entry.error)

    let finalEntries = [...initialEntries]

    if (ambiguousIndices.length > 0) {
      try {
        const snippets = ambiguousIndices.map(({ entry }) => {
          const textContent = extracted.find((e) => e.name === entry.name)?.textContent ?? ''
          return { name: entry.name, snippet: textContent.slice(0, 500) }
        })

        const result = await request(API_ENDPOINTS.INGEST_CLASSIFY, {
          method: 'POST',
          body: { files: snippets },
        })

        const kinds = result?.kinds ?? []
        ambiguousIndices.forEach(({ idx }, i) => {
          const updatedKind = kinds[i]
          if (updatedKind && ['esd', 'api', 'scenario'].includes(updatedKind)) {
            finalEntries = finalEntries.map((e, j) =>
              j === idx ? { ...e, kind: updatedKind, reason: 'LLM 재판정' } : e
            )
          }
        })
      } catch {
        // 재판정 실패(ingest-classify 500 포함) 시 파일 목록은 유지하고 ambiguous로 남긴다 —
        // 사용자가 배지를 클릭해 수동 재지정한다.
        setClassifyNotice('자동 분류에 실패했습니다. 파일 종류를 직접 골라주세요.')
      }
    }

    setEntries((prev) => {
      const next = [...prev, ...finalEntries]
      notifyChange(next)
      return next
    })
    setClassifying(false)
  }, [request, notifyChange])

  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList)
    if (!files.length) return
    classifyAndSet(files)
  }, [classifyAndSet])

  const handleInputChange = (e) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleCycleKind = (idx) => {
    setEntries((prev) => {
      const entry = prev[idx]
      const next = KIND_CYCLE[(KIND_CYCLE.indexOf(entry.kind) + 1) % KIND_CYCLE.length]
      const updated = prev.map((e, i) => (i === idx ? { ...e, kind: next, reason: '수동 재지정' } : e))
      notifyChange(updated)
      return updated
    })
  }

  const handleRemove = (idx) => {
    setEntries((prev) => {
      const updated = prev.filter((_, i) => i !== idx)
      notifyChange(updated)
      return updated
    })
  }

  return (
    <div>
      {/* 드롭존 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging ? 'border-primary-500 bg-blue-50' : 'border-[#D1D5DB] bg-[#F9FAFB]'
        } ${disabled || classifying ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary-500 hover:bg-blue-50'}`}
        onClick={() => !disabled && !classifying && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={MULTI_INGEST_ACCEPT}
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled || classifying}
        />
        <p className="text-sm text-[#6B7280]">
          {classifying ? '분류 중...' : '파일을 드래그하거나 클릭해 선택'}
        </p>
        <p className="text-xs text-[#9CA3AF] mt-1">
          .docx · .json · .yaml · .yml · .pdf · .xlsx · .xls · .csv · .md · .txt
        </p>
      </div>

      {classifyNotice && (
        <p className="mt-2 text-xs text-[#B45309] bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          {classifyNotice}
        </p>
      )}

      {/* 파일 목록 */}
      {entries.length > 0 && (
        <ul className="mt-3 space-y-2">
          {entries.map((entry, idx) => (
            <li key={`${entry.name}-${idx}`} className="flex items-center gap-2 p-2 bg-white border border-[#E5E7EB] rounded-lg text-sm">
              <span className="flex-1 truncate text-[#1F2937]" title={entry.name}>{entry.name}</span>
              <KindBadge kind={entry.kind} onClick={() => handleCycleKind(idx)} />
              {entry.error && (
                <span className="text-xs text-[#EF4444]" title={entry.error}>오류</span>
              )}
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="text-[#9CA3AF] hover:text-[#EF4444] text-xs ml-1"
                title="제거"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MultiFileUpload

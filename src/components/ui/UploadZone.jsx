import { useRef, useState } from 'react'

// 공통 파일 업로드 존 — 끌어다 놓기 + 클릭 선택. 문서 입력 화면(ESD·API 등)에서 테마를 통일한다.
// onFile(file): 선택/드롭된 File을 넘긴다. 같은 파일 재선택도 되도록 input value를 매번 비운다.
export default function UploadZone({
  onFile,
  accept,
  hint,
  title = '파일을 끌어다 놓거나 클릭해서 선택하세요',
  icon = '📄',
  loading = false,
  className = '',
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const pick = (f) => { if (f) onFile(f) }
  const onInputChange = (e) => { pick(e.target.files?.[0]); e.target.value = '' }
  const onDrop = (e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]) }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
        dragging ? 'border-primary-500 bg-blue-50' : 'border-[#E5E7EB] hover:border-primary-500 bg-white'
      } ${className}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {loading ? (
        <p className="text-sm text-[#6B7280]">파일 읽는 중…</p>
      ) : (
        <>
          <div className="mb-3 text-4xl text-[#9CA3AF]">{icon}</div>
          <p className="mb-1 text-sm font-medium text-[#1F2937]">{title}</p>
          {hint && <p className="mb-4 text-xs text-[#9CA3AF]">{hint}</p>}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-md transition-colors"
          >
            파일 선택
          </button>
          <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onInputChange} />
        </>
      )}
    </div>
  )
}

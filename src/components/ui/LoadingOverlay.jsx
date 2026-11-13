import { useLoading } from '../../context/LoadingContext'

// 전역 로딩 오버레이 — 생성·추출 등 진행 중임을 명확히 알린다. App 루트에 한 번만 마운트.
export default function LoadingOverlay() {
  const { active, message } = useLoading()
  if (!active) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 rounded-xl bg-white px-8 py-7 shadow-xl">
        <svg className="h-9 w-9 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm font-medium text-[#1F2937]">{message || '생성 중…'}</p>
      </div>
    </div>
  )
}

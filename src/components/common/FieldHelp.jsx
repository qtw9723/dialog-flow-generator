import { useId, useState } from 'react'
import { Info } from 'lucide-react'

// 라벨 옆 ⓘ 아이콘 + 툴팁. 마우스 호버/포커스(데스크톱)와 클릭 토글(모바일) 모두 지원.
export const FieldHelp = ({ text }) => {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  if (!text) return null

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="도움말"
        aria-describedby={open ? tooltipId : undefined}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[#6B7280] hover:text-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-5 top-0 z-20 w-64 whitespace-pre-line rounded-md border border-[#E5E7EB] bg-[#1F2937] px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}

export default FieldHelp

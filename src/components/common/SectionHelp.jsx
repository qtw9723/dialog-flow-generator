import { useState } from 'react'

// 그룹/섹션 상단에 표시하는 💡 안내 박스. 여러 줄(\n)을 그대로 렌더한다.
// 여러 줄이면 첫 줄만 보이고 '자세히'로 펼친다 — 설문 시나리오 편집기에서 안내 상자가 화면을 다 차지하던 문제.
export const SectionHelp = ({ text }) => {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const [first, ...rest] = String(text).split('\n')
  const more = rest.join('\n').trim()
  return (
    <div className="mb-3 flex gap-2 whitespace-pre-line rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-2 text-xs leading-relaxed text-[#1E40AF]">
      <span aria-hidden="true">💡</span>
      <span className="flex-1">
        {first}
        {more && open && <>{'\n'}{more}</>}
        {more && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-2 font-semibold underline underline-offset-2 hover:text-[#1E3A8A]"
          >
            {open ? '접기' : '자세히'}
          </button>
        )}
      </span>
    </div>
  )
}

export default SectionHelp

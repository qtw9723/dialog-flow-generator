import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquarePlus, X } from 'lucide-react'
import FeedbackPopover from './FeedbackPopover'

// 사용자 접근 페이지 우측 하단의 플로팅 피드백 버튼.
// 클릭하면 버튼 위로 말풍선 팝오버가 펼쳐진다(모달 아님). 관리자 페이지(/admin/*)에는 숨김.
export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const ref = useRef(null)

  // 바깥 클릭·Esc로 닫기
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (location.pathname.startsWith('/admin')) return null

  return (
    <div ref={ref} data-feedback-ui>
      <FeedbackPopover open={open} onClose={() => setOpen(false)} />
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="피드백 보내기"
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary-500 px-5 py-3 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:bg-primary-600 hover:shadow-xl active:scale-95"
      >
        {/* 열림/닫힘에 따라 아이콘 자연스럽게 전환 */}
        <span className="relative h-5 w-5">
          <MessageSquarePlus className={`absolute inset-0 h-5 w-5 transition-all duration-200 ${open ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} />
          <X className={`absolute inset-0 h-5 w-5 transition-all duration-200 ${open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'}`} />
        </span>
        피드백
      </button>
    </div>
  )
}

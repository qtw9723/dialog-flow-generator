import { Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// 설문 진행 패널(왼쪽, 넓은 화면에서 고정). 단계 목록 + 상태 표시, 아래에 부가 옵션(children).
// 좁은 화면에서는 위쪽에 가로로 펼쳐진다.
const STATUS_STYLE = {
  current: 'border-primary-500 bg-primary-50 text-primary-700 font-semibold',
  done: 'border-transparent text-[#1F2937] hover:bg-[#F3F4F6]',
  error: 'border-transparent text-[#B91C1C] hover:bg-[#FEF2F2]',
  todo: 'border-transparent text-[#9CA3AF] hover:bg-[#F3F4F6]',
}

function Marker({ status, n }) {
  if (status === 'done') return <Check className="h-4 w-4 text-[#059669]" aria-label="완료" />
  if (status === 'error') return <AlertCircle className="h-4 w-4 text-[#DC2626]" aria-label="확인 필요" />
  return (
    <span className={cn(
      'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
      status === 'current' ? 'bg-primary-500 text-white' : 'bg-[#E5E7EB] text-[#6B7280]',
    )}>{n}</span>
  )
}

export const StepNav = ({ steps, currentIndex, statusOf, onSelect, disabled, children }) => (
  <aside className="lg:sticky lg:top-8">
    <nav aria-label="설문 단계" className="rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-sm">
      <p className="mb-2 px-2 text-xs font-semibold text-[#6B7280]">
        진행 {currentIndex + 1} / {steps.length}
      </p>
      <ol className="flex gap-1 overflow-x-auto lg:flex-col">
        {steps.map((step, i) => {
          const status = statusOf(i)
          return (
            <li key={step.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(i)}
                disabled={disabled}
                aria-current={i === currentIndex ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm transition-colors disabled:opacity-50',
                  STATUS_STYLE[status],
                )}
              >
                <Marker status={status} n={i + 1} />
                <span className="truncate">{step.title}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {children && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#E5E7EB] px-2 pt-3 lg:flex-col">
          {children}
        </div>
      )}
    </nav>
  </aside>
)

export default StepNav

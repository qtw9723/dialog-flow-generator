import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardBody } from './common/Card'
import { useApi } from '../hooks/useApi'
import { API_ENDPOINTS } from '../lib/constants'

export function AdminLayout({ children, title }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { request } = useApi()

  // 미완료 피드백 수 → '피드백 관리' 탭 배지. 관리자 페이지 진입/이동 시 갱신.
  const [pendingFeedback, setPendingFeedback] = useState(0)
  useEffect(() => {
    let alive = true
    request(API_ENDPOINTS.FEEDBACK)
      .then((data) => { if (alive) setPendingFeedback((Array.isArray(data) ? data : []).filter((f) => !f.completed).length) })
      .catch(() => {})
    return () => { alive = false }
  }, [request, location.pathname])

  const isQuestionsPage = location.pathname === '/admin/questions'
  const isReferencesPage = location.pathname === '/admin/references'
  const isTemplatesPage = location.pathname === '/admin/templates'
  const isSolutionRulesPage = location.pathname === '/admin/solution-rules'
  const isFeedbackPage = location.pathname === '/admin/feedback'
  const isScenarioRefPage = location.pathname === '/admin/scenario-references'
  const isApiRefPage = location.pathname === '/admin/api-references'
  const isTestersPage = location.pathname === '/admin/testers'

  return (
    <div className="space-y-6">
      {/* Header Card with Navigation */}
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-[#1F2937]">{title}</h2>

          {/* Admin Navigation Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-[#E5E7EB]">
            <button
              onClick={() => navigate('/admin/questions')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                isQuestionsPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              질문 관리
            </button>
            <button
              onClick={() => navigate('/admin/references')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                isReferencesPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              참고자료 관리
            </button>
            <button
              onClick={() => navigate('/admin/templates')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                isTemplatesPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              템플릿 관리
            </button>
            <button
              onClick={() => navigate('/admin/solution-rules')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                isSolutionRulesPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              솔루션 규칙
            </button>
            <button
              onClick={() => navigate('/admin/feedback')}
              className={`relative px-4 py-2 font-medium text-sm transition-colors ${
                isFeedbackPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              피드백 관리
              {/* 배지 자리는 항상 예약해 둔다. 숫자가 0→양수로 바뀌어도 탭 폭이 변하지 않아 줄바꿈이 일어나지 않는다. */}
              <span
                aria-hidden={pendingFeedback === 0}
                className={`ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold align-middle ${
                  pendingFeedback > 0 ? 'bg-[#EF4444] text-white' : 'invisible'
                }`}
              >
                {pendingFeedback > 99 ? '99+' : pendingFeedback}
              </span>
            </button>
            <button
              onClick={() => navigate('/admin/scenario-references')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                isScenarioRefPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              시나리오 레퍼런스
            </button>
            <button
              onClick={() => navigate('/admin/api-references')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                isApiRefPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              API 레퍼런스
            </button>
            <button
              onClick={() => navigate('/admin/testers')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                isTestersPage
                  ? 'border-b-2 border-primary-500 text-primary-500'
                  : 'text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              테스터 관리
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Content */}
      {children}
    </div>
  )
}

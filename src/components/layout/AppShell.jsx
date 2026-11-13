import { useState, useEffect, useCallback } from 'react'
import { Menu, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Card } from '../common/Card'
import Sidebar from './Sidebar'
import ContentHeader from './ContentHeader'

export default function AppShell({ children }) {
  const { isApproved, loading } = useAuth()
  // 설문으로 생성은 진행 패널 + 시나리오 목록·편집기를 나란히 두므로 넓게 쓴다. 나머지 화면은 기존 폭 유지.
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/survey')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1' } catch { return false }
  })

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const toggleCollapsed = useCallback(() => setCollapsed((v) => {
    const next = !v
    try { localStorage.setItem('sidebarCollapsed', next ? '1' : '0') } catch { /* noop */ }
    return next
  }), [])

  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e) => { if (e.key === 'Escape') closeSidebar() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sidebarOpen, closeSidebar])

  if (loading) {
    return <div className="min-h-screen bg-[#F8FAFC]" />
  }

  if (!isApproved) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          {children}
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* 데스크톱 고정 사이드바 */}
      <div className="relative z-20 hidden md:flex md:flex-shrink-0">
        <div className="h-screen sticky top-0">
          <Sidebar onNavigate={closeSidebar} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </div>
      </div>

      {/* 모바일 오프캔버스 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* 모바일 오프캔버스 사이드바 */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative h-full">
          <Sidebar onNavigate={closeSidebar} />
          <button
            onClick={closeSidebar}
            className="absolute top-4 -right-10 p-2 rounded-r-md bg-white text-[#6B7280] hover:text-[#111827] shadow"
            aria-label="사이드바 닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 상단 바 */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-[#E5E7EB] sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-md transition-colors"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-sm text-[#1F2937]">DialogFlow Generator</span>
        </header>

        <main className="flex-1 py-8 px-4 md:px-8">
          <div className={wide ? 'mx-auto max-w-[1400px]' : 'mx-auto max-w-[900px]'}>
            <ContentHeader />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import SidebarNav, { SidebarBottom } from './SidebarNav'
import AccountMenu from './AccountMenu'

// collapsed: 데스크톱에서 아이콘만 남는 좁은 레일로 접힌 상태.
// onToggleCollapse: 접기/펼치기 토글(데스크톱 전용 — 모바일 인스턴스는 넘기지 않아 토글 버튼 숨김).
export default function Sidebar({ onNavigate, collapsed = false, onToggleCollapse }) {
  return (
    <aside
      className={`relative flex flex-col h-full bg-white border-r border-[#E5E7EB] transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div
        className={`flex items-center border-b border-[#E5E7EB] py-4 ${collapsed ? 'justify-center px-2' : 'px-4'}`}
      >
        <Link
          to="/"
          onClick={onNavigate}
          title="DialogFlow Generator"
          className={`flex items-center gap-2.5 rounded-md hover:bg-[#F9FAFB] transition-colors ${collapsed ? 'p-1' : ''}`}
        >
          <img src="/favicon.svg" alt="DialogFlow Generator 로고" className="w-8 h-8 rounded-md flex-shrink-0" />
          {!collapsed && (
            <span className="text-sm font-semibold text-[#1F2937] leading-tight">
              DialogFlow<br />Generator
            </span>
          )}
        </Link>
      </div>

      <SidebarNav onNavigate={onNavigate} collapsed={collapsed} />
      <SidebarBottom onNavigate={onNavigate} collapsed={collapsed} />
      <AccountMenu collapsed={collapsed} />

      {/* 세로 중앙, 오른쪽 경계선 위에 걸치는 접기/펼치기 토글 (데스크톱 전용) */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 -right-3 z-10 h-6 w-6 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#6B7280] shadow-sm hover:text-primary-500 hover:border-primary-500 transition-colors"
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      )}
    </aside>
  )
}

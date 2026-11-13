import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { topItems, navGroups, bottomItems } from '../../config/navConfig'

// 접힘(레일) 상태에서 아이콘 오른쪽에 뜨는 스타일 툴팁.
const TOOLTIP_CLASS =
  'pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap ' +
  'rounded-md bg-[#1F2937] px-2 py-1 text-xs font-medium text-white shadow-md opacity-0 ' +
  'transition-opacity duration-150 group-hover:opacity-100'

function NavItem({ item, onNavigate, collapsed }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 py-2 rounded-md text-sm transition-colors ${
          collapsed ? 'justify-center px-2' : 'px-3'
        } ${
          isActive
            ? 'bg-primary-50 text-primary-500 font-medium'
            : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]'
        }`
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && item.label}
      {collapsed && <span className={TOOLTIP_CLASS}>{item.label}</span>}
    </NavLink>
  )
}

export default function SidebarNav({ onNavigate, collapsed = false }) {
  const location = useLocation()

  const isGroupActive = (group) =>
    group.items.some((item) =>
      item.path === '/'
        ? location.pathname === '/'
        : location.pathname === item.path || location.pathname.startsWith(item.path + '/')
    )

  return (
    // 접힘 상태에선 오른쪽 툴팁이 잘리지 않도록 overflow를 풀고, 펼침 상태에선 세로 스크롤.
    <nav className={`flex-1 px-3 py-4 space-y-6 ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
      {topItems.length > 0 && (
        <div className="space-y-1">
          {topItems.map((item) => (
            <NavItem key={item.path} item={item} onNavigate={onNavigate} collapsed={collapsed} />
          ))}
        </div>
      )}

      {navGroups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p
              className={`px-3 mb-1 text-xs font-semibold uppercase tracking-wider ${
                isGroupActive(group) ? 'text-primary-500' : 'text-[#9CA3AF]'
              }`}
            >
              {group.label}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavItem key={item.path} item={item} onNavigate={onNavigate} collapsed={collapsed} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function SidebarBottom({ onNavigate, collapsed = false }) {
  const { isAdmin } = useAuth()

  const items = bottomItems.filter((item) => !item.adminOnly || isAdmin)
  // 보이는 하단 항목이 없으면(일반 사용자 = 관리 숨김) 구분선도 그리지 않는다.
  if (items.length === 0) return null

  return (
    <div className="px-3 py-3 space-y-1 border-t border-[#E5E7EB]">
      {items.map((item) => (
        <NavItem key={item.path} item={item} onNavigate={onNavigate} collapsed={collapsed} />
      ))}
    </div>
  )
}

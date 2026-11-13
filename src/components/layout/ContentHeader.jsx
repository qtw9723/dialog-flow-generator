import { useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { topItems, navGroups, bottomItems } from '../../config/navConfig'

function findNavLabel(pathname) {
  for (const item of topItems) {
    if (pathname === item.path || pathname.startsWith(item.path + '/'))
      return { group: null, label: item.label }
  }
  for (const group of navGroups) {
    for (const item of group.items) {
      const match =
        item.path === '/'
          ? pathname === '/'
          : pathname === item.path || pathname.startsWith(item.path + '/')
      if (match) return { group: group.label, label: item.label }
    }
  }
  if (pathname.startsWith('/admin')) return { group: null, label: '관리' }
  return null
}

export default function ContentHeader({ children }) {
  const { pathname } = useLocation()
  const nav = findNavLabel(pathname)

  if (!nav && !children) return null

  return (
    <div className="flex items-center justify-between mb-6 min-h-[28px]">
      {nav ? (
        <nav className="flex items-center gap-1 text-sm text-[#6B7280]" aria-label="breadcrumb">
          {nav.group && (
            <>
              <span>{nav.group}</span>
              <ChevronRight className="h-3.5 w-3.5 text-[#D1D5DB]" />
            </>
          )}
          <span className="font-medium text-[#111827]">{nav.label}</span>
        </nav>
      ) : (
        <span />
      )}
      {children && (
        <div className="flex items-center gap-2">{children}</div>
      )}
    </div>
  )
}

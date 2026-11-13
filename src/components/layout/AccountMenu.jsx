import { useNavigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../common/Button'

export default function AccountMenu({ collapsed = false }) {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // 관리자는 user가 없을 수 있다(isAuthed = isAdmin || user). 둘 다 없을 때만 숨긴다.
  if (!user && !isAdmin) return null

  const label = user?.email || '관리자'

  // 접힘(레일) 상태: 로그아웃 아이콘만, 계정은 오른쪽 툴팁으로.
  if (collapsed) {
    return (
      <div className="flex justify-center px-2 py-3 border-t border-[#E5E7EB]">
        <div className="group relative">
          <Button variant="ghost" onClick={handleLogout} aria-label={`${label} 로그아웃`} className="p-1.5 min-w-0">
            <LogOut className="h-4 w-4" />
          </Button>
          <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-md bg-[#1F2937] px-2 py-1 text-xs font-medium text-white shadow-md opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {label} — 로그아웃
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 border-t border-[#E5E7EB]">
      <div className="flex items-center gap-2 min-w-0">
        <User className="h-4 w-4 text-[#9CA3AF] flex-shrink-0" />
        <span className="text-xs text-[#6B7280] truncate" title={label}>
          {label}
        </span>
      </div>
      <Button
        variant="ghost"
        onClick={handleLogout}
        title="로그아웃"
        className="flex-shrink-0 p-1.5 min-w-0"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  )
}

import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function Header() {
  const { isAdmin, user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB]">
      <div className="mx-auto max-w-[900px] px-6 h-16 flex items-center justify-between">
        {/* 좌측: 로고/텍스트 */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-500 rounded-md flex items-center justify-center text-white font-semibold">
            C
          </div>
          <span className="text-lg font-semibold text-[#1F2937]">
            DialogFlow Generator
          </span>
        </Link>

        {/* 중앙: 네비게이션 링크 */}
        <nav className="flex items-center gap-8">
          <Link
            to="/"
            className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
          >
            생성기
          </Link>
          <Link
            to="/nl"
            className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
          >
            자연어 생성
          </Link>
          <Link
            to="/results"
            className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
          >
            결과
          </Link>
          <Link
            to="/scenarios"
            className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
          >
            시나리오
          </Link>
          <Link
            to="/convert"
            className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
          >
            ESD 스키마 생성
          </Link>
        </nav>

        {/* 우측: 로그인 상태에 따른 버튼/링크 */}
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              to="/admin/questions"
              className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
            >
              관리
            </Link>
          )}
          {user && (
            <span className="hidden sm:inline text-sm text-[#6B7280]" title={user.email}>
              {user.email}
            </span>
          )}
          {(isAdmin || user) ? (
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-[#EF4444] hover:text-[#DC2626] transition-colors duration-200"
            >
              로그아웃
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="h-9 px-4 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-md transition-colors duration-200"
            >
              로그인
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

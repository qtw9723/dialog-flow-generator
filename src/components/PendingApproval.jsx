import { useAuth } from '../context/AuthContext'
import { Card, CardBody } from './common/Card'

// 로그인했지만 아직 관리자 승인 전(또는 차단)인 테스터에게 보여주는 화면.
export default function PendingApproval() {
  const { status, user, logout } = useAuth()
  const blocked = status === 'blocked'
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
      <Card className="w-full max-w-sm">
        <CardBody className="text-center space-y-3">
          <h2 className="text-xl font-bold text-[#1F2937]">
            {blocked ? '접근이 제한된 계정입니다' : '관리자 승인 대기 중'}
          </h2>
          <p className="text-sm text-[#6B7280]">
            {blocked
              ? '관리자에게 문의해 주세요.'
              : `${user?.email ?? ''} 계정이 등록되었습니다. 관리자 승인 후 이용할 수 있어요.`}
          </p>
          <button
            onClick={logout}
            className="text-sm text-[#6B7280] hover:text-[#1F2937] underline"
          >
            로그아웃
          </button>
        </CardBody>
      </Card>
    </div>
  )
}

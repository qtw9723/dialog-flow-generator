import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, CardBody } from './common/Card'
import Input from './ui/Input'

// 테스터 이메일 OTP 로그인: 이메일 입력 → 코드 메일 → 코드 입력 → 로그인(자동 회원가입).
// 신뢰 기기면 이메일 입력만으로 즉시 로그인(코드 단계 생략).
export default function TesterLogin() {
  const { sendCode, verifyCode, trustedDeviceLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'

  const [step, setStep] = useState('email') // email | code
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submitEmail = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('이메일을 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      // 신뢰 기기면 코드 없이 즉시 로그인. 아니면 기존 OTP 코드 발송으로 폴백.
      if (await trustedDeviceLogin(email.trim())) {
        navigate(from, { replace: true })
        return
      }
      await sendCode(email.trim())
      setStep('code')
    } catch (err) {
      setError(err.message || '코드 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally { setLoading(false) }
  }

  const submitCode = async (e) => {
    e.preventDefault()
    if (!code.trim()) { setError('메일로 받은 코드를 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      await verifyCode(email.trim(), code.trim())
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || '코드가 올바르지 않거나 만료되었습니다.')
    } finally { setLoading(false) }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
      <Card className="w-full max-w-sm">
        <CardBody>
          <h2 className="mb-1 text-2xl font-bold text-center text-[#1F2937]">로그인</h2>
          <p className="mb-6 text-center text-sm text-[#6B7280]">
            {step === 'email' ? '이메일로 인증 코드를 보내드려요.' : `${email} 로 보낸 코드를 입력하세요.`}
          </p>

          {step === 'email' ? (
            <form onSubmit={submitEmail} className="space-y-4">
              <Input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 주소" autoFocus
              />
              {error && <p className="text-sm text-[#EF4444]">{error}</p>}
              <button type="submit" disabled={loading} className="w-full rounded-md bg-primary-500 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                {loading ? '보내는 중…' : '인증 코드 받기'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-4">
              <Input
                type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="인증 코드" autoFocus
                className="text-center text-lg tracking-widest"
              />
              {error && <p className="text-sm text-[#EF4444]">{error}</p>}
              <button type="submit" disabled={loading} className="w-full rounded-md bg-primary-500 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                {loading ? '확인 중…' : '로그인'}
              </button>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError('') }} className="w-full text-sm text-[#6B7280] hover:text-[#1F2937]">
                ← 이메일 다시 입력
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-[#E5E7EB] text-center">
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
            >
              관리자 로그인
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

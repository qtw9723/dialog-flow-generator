import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, CardBody } from './common/Card'
import { Button } from './common/Button'
import { FormInput } from './common/FormInput'

export default function AdminLogin() {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = login(id, password)
      if (result) {
        navigate('/admin/questions')
      } else {
        setError('관리자 ID 또는 비밀번호가 유효하지 않습니다')
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
      <Card className="w-full max-w-sm">
        <CardBody>
          <h2 className="mb-6 text-2xl font-bold text-[#1F2937] text-center">
            관리자 로그인
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormInput
              id="id"
              name="id"
              type="text"
              label="관리자 ID"
              placeholder="ID를 입력해주세요"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
              error={error ? '위의 오류를 확인하세요' : ''}
            />

            <FormInput
              id="password"
              name="password"
              type="password"
              label="비밀번호"
              placeholder="비밀번호를 입력해주세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <div className="p-3 rounded-md bg-[#FEE2E2] border border-[#EF4444] text-[#DC2626] text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !id || !password}
              className="w-full"
            >
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#E5E7EB] text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm text-[#6B7280] hover:text-primary-500 transition-colors duration-200"
            >
              ← 테스터 로그인
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

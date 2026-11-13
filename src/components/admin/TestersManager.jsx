import { useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '../AdminLayout'
import { Card, CardBody } from '../common/Card'
import { Button } from '../common/Button'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { formatKST } from '../../utils/datetime'

const STATUS_LABEL = { pending: '대기', approved: '승인됨', blocked: '차단' }

export default function TestersManager() {
  const { request } = useApi()
  const [testers, setTesters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setTesters(await request(API_ENDPOINTS.ADMIN_TESTERS)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [request])

  useEffect(() => { load() }, [load])

  const setStatus = async (id, status) => {
    try {
      await request(`${API_ENDPOINTS.ADMIN_TESTERS}?id=${id}`, { method: 'PATCH', body: { status } })
      await load()
    } catch (e) { setError(e.message) }
  }

  const removeTester = async (id, email) => {
    if (!window.confirm(`"${email}" 을(를) 테스터 목록에서 삭제할까요? (로그인 계정 자체는 보존됩니다)`)) return
    try {
      await request(`${API_ENDPOINTS.ADMIN_TESTERS}?id=${id}`, { method: 'DELETE' })
      await load()
    } catch (e) { setError(e.message) }
  }

  return (
    <AdminLayout title="테스터 관리">
      {error && (
        <Card className="border-l-4 border-l-[#EF4444] bg-[#FEE2E2]">
          <CardBody><span className="text-[#DC2626]">{error}</span></CardBody>
        </Card>
      )}
      {loading ? (
        <div className="text-center py-12 text-[#6B7280]">로딩 중...</div>
      ) : (
        <div className="space-y-2">
          {testers.length === 0 && (
            <Card><CardBody className="text-center py-12 text-[#6B7280]">테스터가 없습니다.</CardBody></Card>
          )}
          {testers.map((t) => (
            <Card key={t.id}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#1F2937]">{t.email}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {STATUS_LABEL[t.status] || t.status} · {formatKST(t.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {t.status !== 'approved' && <Button size="sm" onClick={() => setStatus(t.id, 'approved')}>승인</Button>}
                  {t.status !== 'blocked' && <Button size="sm" variant="danger" onClick={() => setStatus(t.id, 'blocked')}>차단</Button>}
                  {t.status !== 'pending' && <Button size="sm" variant="secondary" onClick={() => setStatus(t.id, 'pending')}>대기로</Button>}
                  <Button size="sm" variant="secondary" onClick={() => removeTester(t.id, t.email)}>삭제</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}

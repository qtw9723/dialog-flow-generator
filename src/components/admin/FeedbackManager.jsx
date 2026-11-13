import { useEffect, useState, useCallback } from 'react'
import { AdminLayout } from '../AdminLayout'
import { Card, CardBody } from '../common/Card'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { formatKST } from '../../utils/datetime'

// 관리자: 사용자 피드백 목록 확인 + 각 피드백 완료 처리(체크박스).
export default function FeedbackManager() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const { request } = useApi()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await request(API_ENDPOINTS.FEEDBACK)
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || '피드백을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (item) => {
    const next = !item.completed
    // 낙관적 업데이트
    setItems((prev) => prev.map((f) => (f.id === item.id ? { ...f, completed: next } : f)))
    try {
      await request(API_ENDPOINTS.FEEDBACK, {
        method: 'PATCH',
        body: { id: item.id, completed: next },
      })
    } catch (e) {
      // 실패 시 롤백
      setItems((prev) => prev.map((f) => (f.id === item.id ? { ...f, completed: item.completed } : f)))
      setError(e.message || '완료 처리에 실패했습니다.')
    }
  }

  const pending = items.filter((f) => !f.completed).length

  return (
    <AdminLayout title="피드백 관리">
      <Card>
        <CardBody>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-[#6B7280]">
              총 {items.length}건 · 미완료 <span className="font-medium text-[#1F2937]">{pending}</span>건
            </p>
            <button onClick={load} className="text-sm text-primary-500 hover:underline">
              새로고침
            </button>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-[#6B7280]">불러오는 중…</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-[#EF4444]">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#6B7280]">아직 받은 피드백이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[#E5E7EB]">
              {items.map((f) => (
                <li key={f.id} className="flex items-start gap-3 py-4">
                  <input
                    type="checkbox"
                    checked={!!f.completed}
                    onChange={() => toggle(f)}
                    aria-label="완료 처리"
                    className="mt-1 h-4 w-4 cursor-pointer accent-primary-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium text-[#1F2937]">{f.name}</span>
                      {f.completed && (
                        <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs text-[#166534]">완료</span>
                      )}
                      <span className="ml-auto whitespace-nowrap text-xs text-[#9CA3AF]">
                        {formatKST(f.created_at)}
                      </span>
                    </div>
                    <p
                      className={`whitespace-pre-wrap break-words text-sm ${
                        f.completed ? 'text-[#9CA3AF] line-through' : 'text-[#374151]'
                      }`}
                    >
                      {f.content}
                    </p>
                    {f.screenshot_url && (
                      <img
                        src={f.screenshot_url}
                        alt="첨부 스크린샷"
                        className="mt-2 h-24 cursor-zoom-in rounded border border-[#E5E7EB] object-cover"
                        onClick={() => setPreview(f.screenshot_url)}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {preview && (
        <div className="!m-0 fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={() => setPreview(null)}>
          <img src={preview} alt="스크린샷 확대" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
    </AdminLayout>
  )
}

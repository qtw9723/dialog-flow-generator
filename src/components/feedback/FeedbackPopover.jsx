import { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { API_ENDPOINTS } from '../../lib/constants'
import { captureViewport } from '../../lib/captureViewport'

// 플로팅 버튼 위로 말풍선처럼 펼쳐지는 피드백 팝오버(모달 아님).
// open 상태에 따라 scale/opacity/translate로 부드럽게 등장·퇴장한다.
// 보낸 사람은 입력받지 않고 로그인 세션에서 가져온다(테스터=이메일, master 관리자=고정 표기).
export default function FeedbackPopover({ open, onClose }) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [shot, setShot] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [shotError, setShotError] = useState('')
  const { request } = useApi()
  const { user, isAdmin } = useAuth()
  const senderName = user?.email || (isAdmin ? '관리자(master)' : '')

  // 열릴 때마다 새 폼으로 초기화(완료 메시지도 리셋)
  useEffect(() => {
    if (open) {
      setContent(''); setError(''); setDone(false); setSubmitting(false)
      setShot(null); setShotError(''); setCapturing(false)
    }
  }, [open])

  const canSubmit = senderName && content.trim() && !submitting

  const toggleShot = async (checked) => {
    setShotError('')
    if (!checked) { setShot(null); return }
    setCapturing(true)
    const url = await captureViewport()
    setCapturing(false)
    if (url) setShot(url)
    else { setShot(null); setShotError('화면 캡처에 실패했어요. 텍스트만 전송됩니다.') }
  }

  const submit = async () => {
    if (!canSubmit) { setError(senderName ? '피드백 내용을 입력해 주세요.' : '로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.'); return }
    setSubmitting(true); setError('')
    try {
      await request(API_ENDPOINTS.FEEDBACK, { method: 'POST', body: { name: senderName, content: content.trim(), ...(shot ? { screenshot: shot } : {}) } })
      setDone(true)
    } catch (e) {
      setError(e.message || '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="피드백 보내기"
      aria-hidden={!open}
      data-feedback-ui
      className={`fixed bottom-24 right-6 z-40 w-80 max-w-[calc(100vw-3rem)] origin-bottom-right transition-all duration-200 ease-out ${
        open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-95 opacity-0'
      }`}
    >
      <div className="relative rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xl">
        {/* 말풍선 꼬리 (버튼 쪽을 향해 아래로) */}
        <div className="absolute -bottom-2 right-9 h-4 w-4 rotate-45 border-b border-r border-[#E5E7EB] bg-white" />

        {done ? (
          <div className="py-2 text-center">
            <p className="mb-3 text-sm text-[#374151]">소중한 피드백 감사합니다! 🙏</p>
            <button onClick={onClose} className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600">닫기</button>
          </div>
        ) : (
          <>
            <h4 className="mb-1 text-sm font-semibold text-[#1F2937]">피드백 보내기</h4>
            {senderName && (
              <p className="mb-2 truncate text-xs text-[#9CA3AF]" title={senderName}>보내는 사람: {senderName}</p>
            )}
            <div className="space-y-2.5">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="개선점이나 의견을 자유롭게 남겨 주세요"
                className="w-full resize-none rounded-md border border-[#E5E7EB] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <label className="flex items-center gap-2 text-xs text-[#374151]">
                <input type="checkbox" checked={!!shot || capturing} disabled={capturing}
                  onChange={(e) => toggleShot(e.target.checked)} className="h-3.5 w-3.5 accent-primary-500" />
                지금 보는 화면 첨부{capturing && ' (캡처 중…)'}
              </label>
              {shot && (
                <div className="flex items-center gap-2">
                  <img src={shot} alt="첨부될 화면 미리보기" className="h-20 rounded border border-[#E5E7EB]" />
                  <button type="button" onClick={() => toggleShot(true)} className="text-xs text-primary-500 hover:underline">다시 찍기</button>
                </div>
              )}
              {shotError && <p className="text-xs text-[#F59E0B]">{shotError}</p>}
              {error && <p className="text-xs text-[#EF4444]">{error}</p>}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-[#6B7280] hover:bg-[#F8FAFC]">취소</button>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-md bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {submitting ? '전송 중…' : '확인'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

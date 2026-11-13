import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileJson } from 'lucide-react'
import UploadZone from '../ui/UploadZone'
import { inspectUploadedBot } from '../../lib/flow/inspectUploadedBot.js'
import { API_ENDPOINTS } from '../../lib/constants.js'
import { supabase } from '../../lib/supabase.js'
import { Button } from '../common/Button'

const CARD = 'bg-white border border-gray-200 rounded-lg p-5'

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function BotUploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [json, setJson] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [parseError, setParseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [reading, setReading] = useState(false)

  const onPick = async (f) => {
    setFile(f || null); setJson(null); setInspection(null); setParseError(''); setSaveError('')
    if (!f) return
    setReading(true)
    let text
    try { text = await f.text() } catch { setParseError('파일을 읽지 못했습니다.'); setReading(false); return }
    let parsed
    try { parsed = JSON.parse(text) } catch (err) {
      setParseError(`JSON 형식이 아닙니다: ${err.message}`); setReading(false); return
    }
    setJson(parsed)
    setInspection(inspectUploadedBot(parsed))
    setReading(false)
  }

  const onSave = async () => {
    if (!json || !inspection?.ok) return
    setSaving(true); setSaveError('')
    try {
      // 앱 규약(useApi): 세션이 있으면 사용자 토큰, 없으면 anon key.
      // 빈 Bearer를 보내면 Edge Function 플랫폼의 JWT 검증에서 401이 난다(master 관리자 경로).
      const { data: { session } } = await supabase.auth.getSession()
      const bearer = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(API_ENDPOINTS.RESULTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          generated_json: json,
          name: inspection.info.name,
          file_name: file?.name || '',
          sha256: await sha256Hex(JSON.stringify(json)),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(body?.error || `저장 실패 (${res.status})`)
        return
      }
      navigate(`/results/${body.result.id}`)
    } catch (err) {
      setSaveError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const info = inspection?.info

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">기존 챗봇 올리기</h1>
        <p className="text-sm text-gray-500 mt-1">
          솔루션에서 내보낸 챗봇 JSON을 올리면 다이어그램으로 보고 편집할 수 있습니다.
          편집한 뒤 다시 내려받아 솔루션에 올리세요.
        </p>
      </div>

      <UploadZone
        onFile={onPick}
        accept=".json,application/json"
        icon="🤖"
        title="챗봇 JSON을 끌어다 놓거나 클릭해서 선택하세요"
        hint="솔루션에서 내보낸 dialog JSON"
        loading={reading}
      />
      {file && !parseError && (
        <p className="flex items-center gap-1.5 text-xs text-[#6B7280]">
          <FileJson size={14} className="shrink-0 text-[#9CA3AF]" />
          <span className="font-medium text-[#374151]">{file.name}</span>
          <span>· {(file.size / 1024).toFixed(0)} KB</span>
        </p>
      )}
      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{parseError}</div>
      )}

      {inspection && !inspection.ok && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-red-800">이 파일은 올릴 수 없습니다</p>
          <ul className="mt-2 space-y-1 text-sm text-red-700 list-disc list-inside">
            {inspection.blocking.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}

      {inspection?.ok && info && (
        <>
          <div className={CARD}>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">확인</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-500">봇 이름</dt><dd className="text-gray-900">{info.name || '(없음)'}</dd>
              <dt className="text-gray-500">시나리오</dt><dd className="text-gray-900">{info.scenarioCount}개</dd>
              <dt className="text-gray-500">노드</dt><dd className="text-gray-900">{info.nodeCount}개</dd>
              <dt className="text-gray-500">편집 가능</dt><dd className="text-gray-900">{info.editableCount}개</dd>
              <dt className="text-gray-500">내용 잠김</dt><dd className="text-gray-900">{info.lockedCount}개</dd>
            </dl>
          </div>

          {info.lockedCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
              <p><b>{info.lockedCount}개 노드는 내용 편집을 지원하지 않습니다.</b></p>
              <p className="mt-1">
                다이어그램에는 그대로 보이고 <b>연결 바꾸기·삭제는 가능</b>합니다. 내용만 잠깁니다.
                저장·다운로드 시 이 노드들의 설정은 <b>원본 그대로 보존</b>됩니다.
              </p>
              {info.unknownTypes.length > 0 && (
                <p className="mt-2 text-xs">이름을 모르는 타입: {info.unknownTypes.join(', ')}</p>
              )}
            </div>
          )}

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <Button onClick={onSave} disabled={saving}>
            {saving ? '올리는 중…' : '올리고 열기'}
          </Button>
        </>
      )}
    </div>
  )
}

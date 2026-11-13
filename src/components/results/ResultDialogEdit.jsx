import { useState, useRef, useEffect } from 'react'
import { canApplyDialogEdit } from '../../lib/resultEditGating.js'
import { useResults } from '../../context/ResultsContext'
import { Button } from '../common/Button'

const MAX_CONTEXT_TURNS = 3

function getMentText(node) {
  const texts = []
  for (const item of (node?.config?.items || [])) {
    for (const textBlock of (item.text || [])) {
      for (const t of (textBlock.texts || [])) {
        if (t) texts.push(t)
      }
    }
  }
  return texts.length ? texts.join(' / ') : null
}

function buildNodeMap(flowJson) {
  const map = {}
  for (const dialog of (flowJson?.dialogs || [])) {
    for (const node of (dialog.nodes || [])) {
      map[node.id] = node
    }
  }
  return map
}

function NodeDiff({ nodeId, before, after }) {
  const beforeMent = getMentText(before)
  const afterMent = getMentText(after)
  const isAdded = !before
  const isRemoved = !after

  return (
    <div className="text-xs border border-gray-200 rounded p-2 bg-gray-50">
      <p className="font-mono text-gray-400 mb-1">{nodeId}</p>
      {isAdded && (
        <p className="text-green-700">
          + 추가: {after?.label || after?.type || ''}
          {afterMent ? ` "${afterMent}"` : ''}
        </p>
      )}
      {isRemoved && (
        <p className="text-red-600">
          - 삭제: {before?.label || before?.type || ''}
          {beforeMent ? ` "${beforeMent}"` : ''}
        </p>
      )}
      {!isAdded && !isRemoved && (
        <div className="space-y-0.5">
          {before?.label !== after?.label && (
            <p className="text-gray-600">
              <span className="line-through">{before?.label}</span> → {after?.label}
            </p>
          )}
          {beforeMent !== afterMent && beforeMent && (
            <p className="text-red-500 line-through">{beforeMent}</p>
          )}
          {beforeMent !== afterMent && afterMent && (
            <p className="text-green-700">{afterMent}</p>
          )}
          {before?.label === after?.label && beforeMent === afterMent && (
            <p className="text-gray-500">(구조·참조 변경)</p>
          )}
        </div>
      )}
    </div>
  )
}

function TurnCard({ turn, onConfirm, onCancel }) {
  const { response, instruction, status, applying, flowSnapshot } = turn

  const diff = (() => {
    if (!response?.changedNodeIds || !flowSnapshot) return []
    const beforeMap = buildNodeMap(flowSnapshot)
    const afterMap = buildNodeMap(response.newFlow)
    return response.changedNodeIds.map((id) => ({
      id,
      before: beforeMap[id] || null,
      after: afterMap[id] || null,
    }))
  })()

  const canConfirm =
    status === 'pending' &&
    response?.validation?.valid !== false &&
    !response?.clarification &&
    !applying

  return (
    <div className="space-y-2">
      {/* 사용자 발화 */}
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-primary-500 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2 whitespace-pre-wrap break-words">
          {instruction}
        </div>
      </div>

      {/* 봇 응답 */}
      <div className="flex justify-start">
        {status === 'loading' ? (
          <div className="text-sm text-gray-500 px-4 py-2 bg-gray-100 rounded-2xl rounded-tl-sm">
            분석 중...
          </div>
        ) : status === 'error' ? (
          <div className="text-sm text-red-600 px-4 py-2 bg-red-50 border border-red-200 rounded-2xl rounded-tl-sm">
            {turn.errorMsg || '오류가 발생했습니다'}
          </div>
        ) : response ? (
          <div className="max-w-[90%] border border-gray-200 rounded-2xl rounded-tl-sm p-4 bg-white space-y-3">
            {/* mode 배지 + 상태 배지 + clarification */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  response.mode === 'patch'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}
              >
                {response.mode === 'patch' ? '부분 패치' : '전체 재생성'}
              </span>
              {status === 'confirmed' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  확정됨
                </span>
              )}
              {status === 'cancelled' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                  취소됨
                </span>
              )}
              {status === 'undone' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  되돌려짐
                </span>
              )}
              {response.clarification && (
                <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  {response.clarification}
                </span>
              )}
            </div>

            {/* 재검증 실패 */}
            {response.validation && !response.validation.valid && (
              <div className="text-sm text-red-600 bg-red-50 rounded p-2">
                재검증 실패: {(response.validation.errors || []).join(', ')}
              </div>
            )}

            {/* 변경 노드 diff */}
            {diff.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">변경 노드 ({diff.length}개)</p>
                {diff.map(({ id, before, after }) => (
                  <NodeDiff key={id} nodeId={id} before={before} after={after} />
                ))}
              </div>
            ) : response.mode === 'regenerate' ? (
              <p className="text-sm text-gray-500">전체 재생성 — 플로우 전체가 새로 작성됩니다.</p>
            ) : (
              <p className="text-sm text-gray-500">
                {response.clarification
                  ? '명확한 지시를 다시 입력해 주세요.'
                  : '변경 노드 없음'}
              </p>
            )}

            {/* 확정 / 취소 버튼 (pending 상태일 때만) */}
            {status === 'pending' && (
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Button
                  onClick={onConfirm}
                  disabled={!canConfirm || applying}
                  size="sm"
                >
                  {applying ? '저장 중...' : '확정'}
                </Button>
                <Button
                  onClick={onCancel}
                  disabled={applying}
                  variant="outlinePrimary"
                  size="sm"
                >
                  취소
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// 최근 N턴 요약을 instruction 앞에 접두해 대명사·연속 지시 보정
function buildContextPrefix(turns) {
  const recent = turns
    .filter((t) => t.status === 'confirmed' || t.status === 'cancelled')
    .slice(-MAX_CONTEXT_TURNS)
  if (recent.length === 0) return ''
  const summary = recent
    .map((t) => `"${t.instruction}" → ${t.status === 'confirmed' ? '확정됨' : '취소됨'}`)
    .join(', ')
  return `[이전 대화: ${summary}]\n\n`
}

export default function ResultDialogEdit({ result, onResultUpdate }) {
  const { editResult, applyResultEdit, undoResultEdit } = useResults()
  const [turns, setTurns] = useState([])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  const hasHistory =
    Array.isArray(result?.bundle?.edit_history) &&
    result.bundle.edit_history.length > 0

  const hasPendingTurn = turns.some((t) => t.status === 'pending' || t.status === 'loading')

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isProcessing || hasPendingTurn) return

    const prefix = buildContextPrefix(turns)
    const contextInstruction = prefix + text
    const flowSnapshot = result.generated_json
    const turnId = Date.now()

    setTurns((prev) => [
      ...prev,
      { id: turnId, instruction: text, flowSnapshot, response: null, status: 'loading', applying: false },
    ])
    setInput('')
    setIsProcessing(true)
    setError('')

    try {
      const res = await editResult(result.id, contextInstruction)
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, response: res, status: 'pending' } : t))
      )
    } catch (e) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, status: 'error', errorMsg: e.message || '분석 중 오류가 발생했습니다' }
            : t
        )
      )
      setError(e.message || '분석 중 오류가 발생했습니다')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirm = async (turnId) => {
    const turn = turns.find((t) => t.id === turnId)
    if (!turn?.response?.newFlow) return

    // 업로드한 기존 챗봇에는 전체 재생성을 적용하지 않는다 — 이 도구가 모르는 노드의
    // 설정이 사라진다. 부분 패치(applyEditPatch)는 지정 키만 건드리므로 그대로 허용.
    const gate = canApplyDialogEdit(result, turn.response.mode)
    if (!gate.ok) { setError(gate.reason); return }

    setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, applying: true } : t)))
    setError('')

    try {
      const entry = {
        ts: Date.now(),
        mode: 'dialog',
        instruction: turn.instruction,
        snapshotBefore: turn.flowSnapshot,
      }
      const updated = await applyResultEdit(result.id, turn.response.newFlow, entry)
      onResultUpdate(updated)
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, status: 'confirmed', applying: false } : t))
      )
    } catch (e) {
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, applying: false } : t)))
      setError(e.message || '확정 중 오류가 발생했습니다')
    }
  }

  const handleCancel = (turnId) => {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, status: 'cancelled' } : t))
    )
  }

  const handleUndo = async () => {
    setUndoing(true)
    setError('')
    try {
      const updated = await undoResultEdit(result.id)
      onResultUpdate(updated)
      // 마지막 confirmed 턴을 undone으로 표시
      setTurns((prev) => {
        const lastConfirmedIdx = [...prev].map((t, i) => ({ t, i })).reverse().find(({ t }) => t.status === 'confirmed')?.i
        if (lastConfirmedIdx == null) return prev
        return prev.map((t, i) => (i === lastConfirmedIdx ? { ...t, status: 'undone' } : t))
      })
    } catch (e) {
      setError(e.message || '되돌리기 중 오류가 발생했습니다')
    } finally {
      setUndoing(false)
    }
  }

  const sendDisabled = !input.trim() || isProcessing || hasPendingTurn

  return (
    <div className="flex flex-col gap-4">
      {/* 턴 히스토리 */}
      {turns.length > 0 && (
        <div className="space-y-4 max-h-[36rem] overflow-y-auto px-1">
          {turns.map((turn) => (
            <TurnCard
              key={turn.id}
              turn={turn}
              onConfirm={() => handleConfirm(turn.id)}
              onCancel={() => handleCancel(turn.id)}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 입력 영역 */}
      <div className="flex gap-2 items-end">
        <textarea
          className="flex-1 border border-gray-300 rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          rows={2}
          placeholder="예: 인사말을 더 정중하게 바꿔주세요 (Ctrl+Enter로 전송)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isProcessing || hasPendingTurn}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
          }}
        />
        <div className="flex flex-col gap-2 shrink-0">
          <Button onClick={handleSend} disabled={sendDisabled}>
            {isProcessing ? '분석 중...' : '전송'}
          </Button>
          {hasHistory && (
            <Button
              onClick={handleUndo}
              disabled={undoing || isProcessing || hasPendingTurn}
              variant="outlinePrimary"
            >
              {undoing ? '되돌리는 중...' : '되돌리기'}
            </Button>
          )}
        </div>
      </div>

      {hasPendingTurn && (
        <p className="text-xs text-gray-400">응답을 확정하거나 취소한 후 다음 지시를 입력할 수 있습니다.</p>
      )}
    </div>
  )
}

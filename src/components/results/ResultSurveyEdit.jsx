import { useState, useCallback, useRef } from 'react'
import { useResults } from '../../context/ResultsContext'
import { useTemplates } from '../../context/TemplatesContext'
import { QuestionCard } from '../questionnaire/QuestionCard'
import { INPUT_TYPES } from '../../lib/constants'
import { validateScenarios, validateApiIntegrations } from '../questionnaire/scenarioFields'
import { validateSteps } from '../../lib/scenario/steps'
import { buildNodeMap, NodeDiff } from './nodeDiff.jsx'
import { hasAnswer } from '../../lib/resultEditGating'
import { attachTemplate } from '../../lib/questions/attachTemplate'
import { Button } from '../common/Button'

export default function ResultSurveyEdit({ result, questions, onResultUpdate }) {
  const { regenerateFromResponses, applyResultEdit, undoResultEdit } = useResults()
  const { templates } = useTemplates()
  // 질문 목록은 template_id만 준다 — 템플릿 본문을 붙여야 QuestionCard가 시나리오 편집기를 열고,
  // q.template에 의존하는 시나리오 검증도 돈다(안 붙이면 둘 다 조용히 건너뛴다).
  const withTemplate = useCallback((q) => attachTemplate(q, templates), [templates])
  const [answers, setAnswers] = useState(() => result.responses || {})
  const [fieldErrors, setFieldErrors] = useState({})
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState('')
  const [orphanWarning, setOrphanWarning] = useState(false)
  const [showAll, setShowAll] = useState(false)
  // 검증 실패 위치(시나리오·단계/연동) — 설문 화면과 같은 방식으로 해당 카드로 이동시킨다. nonce로 같은 위치도 재트리거.
  const [focusTarget, setFocusTarget] = useState(null)
  const focusNonce = useRef(0)
  const focusOn = (target) => { focusNonce.current += 1; setFocusTarget({ ...target, nonce: focusNonce.current }) }

  // 빠른 수정: 실제 응답이 있는 항목 우선 노출, 나머지는 '전체 항목 보기'로 접는다.
  // 판정은 최초 응답 기준으로 1회 고정 — 편집 중 필드를 비워도 목록이 흔들리지 않게 한다.
  // 응답 있는 항목이 하나도 없으면(비정상) 전체를 그대로 보여준다.
  const allQuestions = questions || []
  const [answeredIds] = useState(
    () => new Set(allQuestions.filter((q) => hasAnswer(q, result.responses || {})).map((q) => q.id)),
  )
  const hiddenCount = allQuestions.length - answeredIds.size
  const visibleQuestions =
    showAll || answeredIds.size === 0 ? allQuestions : allQuestions.filter((q) => answeredIds.has(q.id))

  const hasHistory =
    Array.isArray(result?.bundle?.edit_history) &&
    result.bundle.edit_history.length > 0

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    if (fieldErrors[questionId]) {
      setFieldErrors((prev) => ({ ...prev, [questionId]: null }))
    }
  }

  const validateAllRequired = () => {
    const newErrors = {}
    let valid = true
    for (const raw of (questions || [])) {
      const q = withTemplate(raw)
      if (!q.is_required) continue
      const answer = answers[q.id]
      if (q.input_type === INPUT_TYPES.STRUCTURED) {
        const hasValue = answer && typeof answer === 'object' && Object.values(answer).some((v) => {
          if (typeof v === 'string') return v.trim().length > 0
          return Boolean(v)
        })
        if (!hasValue) { newErrors[q.id] = '필수 항목입니다'; valid = false }
      } else if (q.input_type === INPUT_TYPES.TEMPLATED) {
        if (q.template) {
          const scenarioMsg = validateScenarios(answer, q.template)
          if (scenarioMsg) { newErrors[q.id] = scenarioMsg; valid = false }
          else {
            // 검증 순서는 설문 화면(QuestionnaireForm)과 같게: 시나리오 → 흐름(단계) → API 연동.
            const list = Array.isArray(answer) ? answer : []
            let stepFailed = false
            for (let sIdx = 0; sIdx < list.length; sIdx++) {
              if (String(list[sIdx]?.['레퍼런스 선택'] || '').trim()) continue
              const stepFail = validateSteps(list[sIdx]?.['단계'])
              if (stepFail) {
                newErrors[q.id] = `시나리오 ${sIdx + 1}의 ${stepFail.message}`; valid = false; stepFailed = true
                focusOn({ scenarioIndex: sIdx, stepPath: stepFail.path })
                break
              }
            }
            if (!stepFailed) {
              const apiFail = validateApiIntegrations(answer)
              if (apiFail) {
                newErrors[q.id] = apiFail.message; valid = false
                focusOn({ scenarioIndex: apiFail.scenarioIndex, integrationIndex: apiFail.integrationIndex })
              }
            }
          }
        } else if (!answer) {
          newErrors[q.id] = '필수 항목입니다'; valid = false
        }
      } else {
        if (!answer) { newErrors[q.id] = '필수 항목입니다'; valid = false }
      }
    }
    setFieldErrors(newErrors)
    return valid
  }

  const handlePreview = async () => {
    // 검증 실패 시 접혀 있던 필수 항목의 오류가 보이도록 전체 항목을 펼친다.
    if (!validateAllRequired()) { setShowAll(true); return }
    setLoading(true)
    setError('')
    setPreview(null)
    setOrphanWarning(false)
    try {
      const res = await regenerateFromResponses(result.id, answers, questions)
      setPreview(res)
      if (res.orphanCleanupFailed) setOrphanWarning(true)
    } catch (e) {
      setError(e.message || '재생성 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!preview?.newFlow) return
    setApplying(true)
    setError('')
    try {
      const entry = {
        ts: Date.now(),
        mode: 'survey',
        instruction: preview.instruction,
        snapshotBefore: result.generated_json,
        // 확정이 nlp·esd_error·api_error를 갈아끼우므로 되돌리기가 함께 되돌릴 수 있게
        // 확정 직전 값을 전부 싣는다(esd_error·api_error도 nlpBefore와 같은 방식).
        nlpBefore: result.bundle?.nlp ?? null,
        nlpErrorBefore: result.bundle?.nlp_error ?? null,
        esdErrorBefore: result.bundle?.esd_error ?? null,
        apiErrorBefore: result.bundle?.api_error ?? null,
      }
      const updated = await applyResultEdit(result.id, preview.newFlow, entry, {
        nlp: preview.nlp,
        nlpError: preview.nlpError,
        esdError: preview.esdError,
        apiError: preview.apiError,
      })
      onResultUpdate(updated)
      setPreview(null)
    } catch (e) {
      setError(e.message || '확정 중 오류가 발생했습니다')
    } finally {
      setApplying(false)
    }
  }

  const handleUndo = async () => {
    setUndoing(true)
    setError('')
    try {
      const updated = await undoResultEdit(result.id)
      onResultUpdate(updated)
      setPreview(null)
    } catch (e) {
      setError(e.message || '되돌리기 중 오류가 발생했습니다')
    } finally {
      setUndoing(false)
    }
  }

  // 클라이언트사이드 diff — 노드 ID 기준으로 변경/추가/삭제 비교
  const diff = (() => {
    if (!preview?.newFlow) return []
    const beforeMap = buildNodeMap(result.generated_json)
    const afterMap = buildNodeMap(preview.newFlow)
    const allIds = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])
    const changed = []
    for (const id of allIds) {
      if (JSON.stringify(beforeMap[id]) !== JSON.stringify(afterMap[id])) {
        changed.push({ id, before: beforeMap[id] || null, after: afterMap[id] || null })
      }
    }
    return changed
  })()

  const canConfirm = (preview?.validation?.valid !== false) && !applying

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {visibleQuestions.map((q) => (
          <QuestionCard
            key={q.id}
            question={withTemplate(q)}
            value={answers[q.id]}
            onChange={(v) => handleAnswerChange(q.id, v)}
            error={fieldErrors[q.id]}
            focusTarget={focusTarget}
          />
        ))}
        {!showAll && answeredIds.size > 0 && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full rounded-md border border-dashed border-gray-300 py-2 text-sm text-primary-500 hover:bg-blue-50"
          >
            + 전체 항목 보기 ({hiddenCount}개 더)
          </button>
        )}
        {showAll && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="w-full rounded-md border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            응답한 항목만 보기
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={handlePreview}
          disabled={loading || applying}
        >
          {loading ? '재생성 중...' : '재생성 (미리보기)'}
        </Button>
        {hasHistory && (
          <Button
            onClick={handleUndo}
            disabled={undoing || loading || applying}
            variant="outlinePrimary"
          >
            {undoing ? '되돌리는 중...' : '직전으로 되돌리기'}
          </Button>
        )}
      </div>

      {orphanWarning && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
          임시 결과 정리 실패 — 목록에 임시 항목이 보이면 새로고침 후 삭제하세요.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview && (
        <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
          {preview.validation && !preview.validation.valid && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-2">
              재검증 실패: {(preview.validation.errors || []).join(', ')}
            </div>
          )}

          {diff.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">변경 노드 ({diff.length}개)</p>
              {diff.map(({ id, before, after }) => (
                <NodeDiff key={id} nodeId={id} before={before} after={after} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">전체 재생성 — 플로우 전체가 새로 작성됩니다.</p>
          )}

          {preview.instruction && preview.instruction !== '변경 없음' && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">{preview.instruction}</p>
          )}

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button onClick={handleApply} disabled={!canConfirm}>
              {applying ? '저장 중...' : '확정'}
            </Button>
            <Button onClick={() => setPreview(null)} disabled={applying} variant="outlinePrimary">
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

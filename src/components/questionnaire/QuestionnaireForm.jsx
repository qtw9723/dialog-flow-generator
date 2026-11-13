import { useMemo, useRef, useState } from 'react'
import { useQuestions } from '../../context/QuestionsContext'
import { useTemplates } from '../../context/TemplatesContext'
import { useReferences } from '../../context/ReferencesContext'
import { useResults } from '../../context/ResultsContext'
import { useAuth } from '../../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { INPUT_TYPES } from '../../lib/constants'
import { attachTemplate } from '../../lib/questions/attachTemplate'
import { groupSteps } from '../../lib/questions/groupSteps'
import { fullWidthFlags } from '../../lib/questions/fullWidthFlags'
import { Button } from '../common/Button'
import { QuestionCard } from './QuestionCard'
import { validateScenarios, validateApiIntegrations } from './scenarioFields'
import { validateSteps } from '../../lib/scenario/steps'
import { Modal } from '../common/Modal'
import { PocDocGenerateFlow } from '../pocDoc/PocDocGenerateFlow'
import EsdFrontStage from '../esd/EsdFrontStage.jsx'
import MappingStep from '../mapping/MappingStep.jsx'
import { StepNav } from './StepNav'

// 2열 배치에서 한 줄 전체를 쓰는 질문: 긴 글·시나리오.
const isWideQuestion = (q) => q.input_type === INPUT_TYPES.TEXTAREA || q.input_type === INPUT_TYPES.TEMPLATED

export const QuestionnaireForm = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { questions } = useQuestions()
  const { templates } = useTemplates()
  const { masterReference } = useReferences()
  const { createResult } = useResults()
  const { user } = useAuth()

  const [showPocDoc, setShowPocDoc] = useState(false)
  // 질문 9개를 화면 단계(기본 정보 · 시나리오 · 추가 설정)로 묶어 한 화면에 여러 질문을 보여준다.
  const [stepIndex, setStepIndex] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  // ESD 선행 정의 (기본 off — off 경로는 createResult 인자·기존 동작 완전 무변경)
  const [esdToggle, setEsdToggle] = useState(false)
  const [confirmedEsd, setConfirmedEsd] = useState(null)
  // 블록 C: 생성 전 매핑 확정 (옵트인, 기본 off)
  const [mappingToggle, setMappingToggle] = useState(false)
  const [showMappingStep, setShowMappingStep] = useState(false)
  const [proposedMapping, setProposedMapping] = useState(null)
  const [draft1ResultId, setDraft1ResultId] = useState(null)
  // 결과 페이지의 "이 답변으로 다시 생성"에서 넘어온 경우 이전 답변으로 프리필.
  const [answers, setAnswers] = useState(() => location.state?.initialAnswers || {})
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [resultId, setResultId] = useState(null)
  // 검증 실패한 외부 연동으로 자동 스크롤시킬 대상. nonce로 같은 위치 반복 실패도 매번 재트리거.
  const [focusTarget, setFocusTarget] = useState(null)
  const focusNonce = useRef(0)

  const steps = useMemo(() => groupSteps(questions), [questions])
  const currentStep = steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === steps.length - 1

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    // Clear error when user starts typing
    if (errors[questionId]) {
      setErrors((prev) => ({ ...prev, [questionId]: null }))
    }
  }

  // 질문 하나의 검증(순수) — 실패 시 { message, focus? }, 통과 시 null. 진행 패널 상태 표시에도 쓴다.
  const questionError = (question) => {
    if (!question.is_required) return null
    const answer = answers[question.id]

    // For STRUCTURED type, check if answer object has at least some values
    if (question.input_type === INPUT_TYPES.STRUCTURED) {
      const hasValue = answer && typeof answer === 'object' && Object.values(answer).some(v => {
        if (typeof v === 'string') {
          return v.trim().length > 0
        }
        return Boolean(v)
      })
      return hasValue ? null : { message: '필수 항목입니다' }
    }

    // For TEMPLATED type, validate scenarios (supports nested group_list)
    if (question.input_type === INPUT_TYPES.TEMPLATED) {
      const template = attachTemplate(question, templates).template
      const scenarioMsg = validateScenarios(answer, template)
      if (scenarioMsg) return { message: scenarioMsg }
      // 시나리오 흐름(단계) 검증 — 레퍼런스 선택 시나리오는 흐름이 무시되므로 건너뛴다.
      for (let sIdx = 0; sIdx < (Array.isArray(answer) ? answer.length : 0); sIdx++) {
        const sc = answer[sIdx]
        if (String(sc?.['레퍼런스 선택'] || '').trim()) continue
        const stepFail = validateSteps(sc?.['단계'])
        if (stepFail) return { message: `시나리오 ${sIdx + 1}의 ${stepFail.message}`, focus: { scenarioIndex: sIdx, stepPath: stepFail.path } }
      }
      // API 연동 미통과 시: 메시지 + 문제 연동 위치를 잡아 해당 위치로 자동 이동시킨다.
      const apiFail = validateApiIntegrations(answer)
      if (apiFail) return { message: apiFail.message, focus: { scenarioIndex: apiFail.scenarioIndex, integrationIndex: apiFail.integrationIndex } }
      return null
    }

    // For other types, check if answer exists and is not empty
    return answer ? null : { message: '필수 항목입니다' }
  }

  // 현재 단계의 질문을 모두 검증하고 실패한 질문마다 메시지를 띄운다.
  const validateStep = (step) => {
    const nextErrors = {}
    let focus = null
    for (const question of step?.questions || []) {
      const fail = questionError(question)
      if (!fail) continue
      nextErrors[question.id] = fail.message
      if (fail.focus && !focus) focus = fail.focus
    }
    if (Object.keys(nextErrors).length === 0) return true
    setErrors((prev) => ({ ...prev, ...nextErrors }))
    if (focus) {
      focusNonce.current += 1
      setFocusTarget({ ...focus, nonce: focusNonce.current })
    }
    return false
  }

  const goToStep = (index) => {
    setStepIndex(index)
    setMaxReached((m) => Math.max(m, index))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (isLast) {
        handleSubmit()
      } else {
        goToStep(stepIndex + 1)
      }
    }
  }

  const handlePrevious = () => {
    if (!isFirst) goToStep(stepIndex - 1)
  }

  // 진행 패널: 지나온 단계로는 자유롭게, 앞 단계로는 사이 단계가 모두 통과일 때만 이동한다.
  const handleStepClick = (index) => {
    if (index <= stepIndex) return goToStep(index)
    for (let k = stepIndex; k < index; k++) {
      if (!validateStep(steps[k])) return goToStep(k)
    }
    goToStep(index)
  }

  const stepStatus = (index) => {
    if (index > maxReached) return 'todo'
    const hasError = steps[index].questions.some((q) => errors[q.id] || (index < stepIndex && questionError(q)))
    if (hasError) return 'error'
    if (index === stepIndex) return 'current'
    return steps[index].questions.every((q) => !questionError(q)) ? 'done' : 'todo'
  }

  const handleSubmit = async () => {
    if (!masterReference) {
      setErrors({ submit: '마스터 참고자료가 없습니다. 관리자에게 문의하세요.' })
      return
    }

    setIsLoading(true)
    try {
      if (mappingToggle && confirmedEsd) {
        // 블록 C: 1차 생성 → MappingStep 대기
        const draft = await createResult(answers, masterReference.id, user?.email, confirmedEsd, undefined, 'survey')
        const esdMappingFromDraft = draft.bundle?.esd_mapping
        if (esdMappingFromDraft) {
          setDraft1ResultId(draft.id)
          setProposedMapping(esdMappingFromDraft)
          setIsLoading(false)
          setShowMappingStep(true)
          return
        }
        // esd_mapping 없으면 1차 결과 바로 사용 (graceful fallback)
        setResultId(draft.id)
        setShowCompletionModal(true)
      } else {
        // 블록 B: 단일 pass
        const result = await createResult(answers, masterReference.id, user?.email, confirmedEsd, undefined, 'survey')
        setResultId(result.id)
        setShowCompletionModal(true)
      }
    } catch (error) {
      console.error('설문 작성 오류:', error)
      setErrors({ submit: `설문 작성 중 오류가 발생했습니다: ${error.message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleMappingConfirm = async (confirmedMapping) => {
    setIsLoading(true)
    try {
      const result = await createResult(answers, masterReference.id, user?.email, confirmedEsd, confirmedMapping, 'survey')
      setResultId(result.id)
      setShowMappingStep(false)
      setShowCompletionModal(true)
    } catch (error) {
      console.error('2차 생성 오류:', error)
      // 2차 실패 시 1차 결과로 폴백 (AC5 격리)
      setErrors({ submit: `2차 생성 중 오류가 발생했습니다: ${error.message}` })
      if (draft1ResultId) {
        setResultId(draft1ResultId)
        setShowMappingStep(false)
        setShowCompletionModal(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleMappingCancel = () => {
    setResultId(draft1ResultId)
    setShowMappingStep(false)
    setShowCompletionModal(true)
  }

  const handleViewResults = () => {
    setShowCompletionModal(false)
    navigate(`/results/${resultId}`)
  }

  const handleNewQuestionnaire = () => {
    setStepIndex(0)
    setMaxReached(0)
    setAnswers({})
    setErrors({})
    setShowCompletionModal(false)
    setEsdToggle(false)
    setConfirmedEsd(null)
    setMappingToggle(false)
    setShowMappingStep(false)
    setProposedMapping(null)
    setDraft1ResultId(null)
  }

  if (showPocDoc) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <PocDocGenerateFlow onBack={() => setShowPocDoc(false)} />
      </div>
    )
  }

  // 블록 C: 매핑 확정 단계
  if (showMappingStep) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-semibold text-[#1F2937]">매핑 확정 후 2차 생성</h2>
        </div>
        {isLoading ? (
          <p className="text-sm text-[#6B7280] text-center py-10">2차 생성 중… 잠시만 기다려 주세요</p>
        ) : (
          <>
            {errors.submit && (
              <div className="mb-4 p-4 bg-[#FEE2E2] border border-[#EF4444] rounded-lg text-[#EF4444] text-sm">
                {errors.submit}
              </div>
            )}
            <MappingStep
              proposedMapping={proposedMapping}
              onConfirm={handleMappingConfirm}
              onCancel={handleMappingCancel}
            />
          </>
        )}
        <Modal isOpen={showCompletionModal} onClose={handleNewQuestionnaire} title="설문 작성 완료" size="md">
          <div className="text-center">
            <p className="text-xl font-semibold text-primary-500 mb-4">축하합니다!</p>
            <p className="text-base text-[#6B7280] mb-8">설문 작성이 완료되었습니다. 작성하신 답변은 결과에 저장되었습니다.</p>
            <div className="flex flex-col gap-4">
              <Button variant="secondary" className="w-full" onClick={handleNewQuestionnaire}>새로운 설문 작성</Button>
              <Button variant="default" className="w-full" onClick={handleViewResults}>결과 보기</Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg p-8 text-center shadow-sm">
          <p className="text-[#6B7280]">사용 가능한 설문이 없습니다</p>
        </div>
      </div>
    )
  }

  const industryQ = questions.find((q) => q.text?.includes('산업군'))
  const selectedCategory = industryQ ? answers[industryQ.id] : ''

  const renderQuestion = (question) => (
    <QuestionCard
      question={attachTemplate(question, templates)}
      value={answers[question.id] || (() => {
        if (question.input_type === INPUT_TYPES.TEMPLATED) return []
        if (question.input_type === INPUT_TYPES.STRUCTURED) return {}
        return ''
      })()}
      onChange={(value) => handleAnswerChange(question.id, value)}
      error={errors[question.id]}
      focusTarget={focusTarget}
      industry={selectedCategory}
    />
  )

  const isScenarioStep = currentStep?.questions.some((q) => q.input_type === INPUT_TYPES.TEMPLATED)

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] items-start">
      <StepNav
        steps={steps}
        currentIndex={stepIndex}
        statusOf={stepStatus}
        onSelect={handleStepClick}
        disabled={isLoading}
      >
        <button
          onClick={() => setShowPocDoc(true)}
          className="text-sm text-[#6B7280] hover:text-primary-500"
        >
          POC 문서로 생성 →
        </button>
        {/* ESD 선행 정의 토글 (기본 off) */}
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[#6B7280]">
          <input
            type="checkbox"
            checked={esdToggle}
            onChange={(e) => { setEsdToggle(e.target.checked); if (!e.target.checked) { setConfirmedEsd(null); setMappingToggle(false) } }}
            disabled={isLoading}
            className="rounded border-[#D1D5DB]"
          />
          ESD 먼저 정의
        </label>
      </StepNav>

      <div className="min-w-0">
        {/* ESD 패널 (토글 on 시) */}
        {esdToggle && (
          <div className="mb-6">
            {confirmedEsd ? (
              <div className="rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] px-4 py-3 text-sm text-[#065F46]">
                <div className="flex items-center justify-between">
                  <span>ESD 확정됨 — 엔티티 {confirmedEsd.entities?.length ?? 0}개{(confirmedEsd.apis?.length ?? 0) > 0 ? `, API ${confirmedEsd.apis.length}개` : ''}</span>
                  <button
                    onClick={() => { setConfirmedEsd(null); setMappingToggle(false) }}
                    disabled={isLoading}
                    className="text-xs text-[#059669] hover:underline disabled:opacity-50"
                  >
                    변경
                  </button>
                </div>
                <div className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#059669]">
                    <input
                      type="checkbox"
                      checked={mappingToggle}
                      onChange={(e) => setMappingToggle(e.target.checked)}
                      disabled={isLoading}
                      className="rounded border-[#6EE7B7]"
                    />
                    생성 전 매핑 확정
                  </label>
                </div>
              </div>
            ) : (
              <EsdFrontStage
                onConfirm={(esdJson) => setConfirmedEsd(esdJson)}
                onCancel={() => setEsdToggle(false)}
              />
            )}
          </div>
        )}

        {/* 현재 단계의 질문들 — 짧은 질문은 2열, 긴 글(textarea)·시나리오는 한 줄 전체 */}
        {currentStep && (
          <div className={isScenarioStep ? 'mb-6' : 'mb-6 grid gap-x-6 md:grid-cols-2'}>
            {fullWidthFlags(currentStep.questions, isWideQuestion).map((full, i) => {
              const question = currentStep.questions[i]
              return (
                <div key={question.id} className={full ? 'md:col-span-2' : ''}>
                  {renderQuestion(question)}
                </div>
              )
            })}
          </div>
        )}

        {/* Submit Error */}
        {errors.submit && (
          <div className="mb-4 p-4 bg-[#FEE2E2] border border-[#EF4444] rounded-lg text-[#EF4444] text-sm">
            {errors.submit}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3 justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={isFirst}
          >
            이전
          </Button>
          <Button
            onClick={handleNext}
            disabled={isLoading}
          >
            {isLoading ? '작성 중...' : isLast ? '제출' : '다음'}
          </Button>
        </div>
      </div>

      {/* Completion Modal */}
      <Modal
        isOpen={showCompletionModal}
        onClose={handleNewQuestionnaire}
        title="설문 작성 완료"
        size="md"
      >
        <div className="text-center">
          <p className="text-xl font-semibold text-primary-500 mb-4">축하합니다!</p>
          <p className="text-base text-[#6B7280] mb-8">
            설문 작성이 완료되었습니다. 작성하신 답변은 결과에 저장되었습니다.
          </p>
          <div className="flex flex-col gap-4">
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleNewQuestionnaire}
            >
              새로운 설문 작성
            </Button>
            <Button
              variant="default"
              className="w-full"
              onClick={handleViewResults}
            >
              결과 보기
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default QuestionnaireForm

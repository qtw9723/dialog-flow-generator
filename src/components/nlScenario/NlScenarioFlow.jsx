import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useQuestions } from '../../context/QuestionsContext'
import { useTemplates } from '../../context/TemplatesContext'
import { useReferences } from '../../context/ReferencesContext'
import { useResults } from '../../context/ResultsContext'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'
import { ScenarioQuestionCard } from '../questionnaire/ScenarioQuestionCard'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { mapExtractedToScenarios, buildResponsesFromPreview, hasUsableScenario } from '../../lib/pocDoc/buildPreviewState'
import { lengthWarning } from '../../lib/pocDoc/lengthWarning'
import EsdFrontStage from '../esd/EsdFrontStage.jsx'
import MappingStep from '../mapping/MappingStep.jsx'
import MultiFileUpload from '../ingest/MultiFileUpload'
import { assembleFromClassified } from '../../lib/ingest/assembleFromClassified'
import { summarizeIngestFailures } from '../../lib/ingest/summarizeIngestFailures'
import { extractApiDefsFromFile } from '../../lib/apiDoc/extractApiDefsFromFile'
import { getFileSheetNames, parseFileSheet } from '../../lib/parseExcelFile'
import { extractFileText } from '../pocDoc/extractFileText'
import { withFieldOverrides } from '../../lib/questions/fieldOverrides'

const FALLBACK_TEMPLATE = { name: '시나리오 템플릿', fields: [] }

// 자연어로 시나리오 생성 — 설문 폼 대체 입력.
// poc-doc-gen과 동일 파이프라인(자연어는 이미 텍스트라 문서 파싱 앞단만 없음):
// NL 텍스트 → nl-scenario-parse(LLM) → Extracted → 편집 미리보기 → responses → createResult.
export function NlScenarioFlow() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { questions } = useQuestions()
  const { templates } = useTemplates()
  const { masterReference } = useReferences()
  const { createResult } = useResults()
  const { request } = useApi()

  // 'input' | 'parsing' | 'esd-confirm' | 'preview'
  const [step, setStep] = useState('input')
  const [nlText, setNlText] = useState('')

  const [botName, setBotName] = useState('')
  const [scenarios, setScenarios] = useState([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [resultId, setResultId] = useState(null)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  // 2차(매핑 확정) 생성이 실패해 1차 초안으로 폴백했을 때만 true — 완료 모달에 그 사실을 알린다.
  const [mappingFallback, setMappingFallback] = useState(false)

  // ESD 선행 정의 (기본 off — off 경로는 createResult 인자·기존 동작 완전 무변경)
  const [esdToggle, setEsdToggle] = useState(false)
  const [confirmedEsd, setConfirmedEsd] = useState(null)
  // 블록 C: 생성 전 매핑 확정 (옵트인, 기본 off — ESD 확정 시만 의미 있음)
  const [mappingToggle, setMappingToggle] = useState(false)
  const [proposedMapping, setProposedMapping] = useState(null)
  const [draft1ResultId, setDraft1ResultId] = useState(null)

  // 다중 파일 경로 상태
  const [multiFiles, setMultiFiles] = useState([])
  const [pendingEsd, setPendingEsd] = useState(null)
  const [multiRoutingError, setMultiRoutingError] = useState(null)
  const [multiResetKey, setMultiResetKey] = useState(0)
  // 다중 파일(및 자연어 파싱) 중 일부가 실패했을 때 보여줄 요약 (조용히 건너뛰지 않고 사용자에게 알린다)
  const [ingestWarning, setIngestWarning] = useState(null)
  // 긴 문서 사전 경고 — 실패(ingestWarning)와 별개, 추출을 막지는 않고 알리기만 한다
  const [lengthWarn, setLengthWarn] = useState(null)

  // 다중 파일 경로는 setStep('esd-confirm'|'preview')과 같은 동기 구간에서 배너 상태를 채우므로
  // (React가 한 커밋으로 배칭), input/parsing 화면에서만 렌더하면 그 프레임이 통째로 안 보인다.
  // 그래서 배너 JSX를 한 곳에서 만들어 모든 단계 화면에서 재사용한다(JSX 복제 금지).
  const ingestWarningBanner = ingestWarning ? (
    <div className="mb-4 p-4 bg-[#FEF3C7] border border-[#F59E0B] rounded-lg text-[#92400E] text-sm whitespace-pre-line">
      {ingestWarning}
    </div>
  ) : null
  const lengthWarnBanner = lengthWarn ? (
    <p className="mb-3 text-sm text-[#F59E0B]">{lengthWarn}</p>
  ) : null

  const scenarioQ =
    questions.find(
      (q) => q.question_role === 'required_context' && typeof q.text === 'string' && q.text.includes('시나리오'),
    ) ?? questions.find((q) => q.question_role === 'required_context')
  const template = withFieldOverrides(templates.find((t) => t.id === scenarioQ?.template_id)) || FALLBACK_TEMPLATE
  const botNameQ = questions.find((q) => typeof q.text === 'string' && q.text.includes('챗봇 이름'))

  const handleParse = async () => {
    if (!nlText.trim()) return
    setStep('parsing')
    setIngestWarning(null)
    setLengthWarn(null)
    const warning = lengthWarning(nlText)
    if (warning) setLengthWarn(warning)
    try {
      const data = await request(API_ENDPOINTS.NL_SCENARIO_PARSE, {
        method: 'POST',
        body: { text: nlText },
        loadingMessage: '시나리오 분석 중…',
      })
      const ext = data || { scenarios: [] }
      setBotName(ext.botName || '')
      setScenarios(mapExtractedToScenarios(ext.scenarios || [], template))
    } catch (err) {
      // 오류가 나도 빈 미리보기로 흡수해 계속 진행하되(사용자가 채워 생성), 실패 사유는 배너로 보여준다
      setIngestWarning(summarizeIngestFailures([{ name: '자연어 텍스트', reason: err?.message ?? '자연어 시나리오 분석에 실패했습니다.' }], 1))
      setBotName('')
      setScenarios([])
    }
    setStep('preview')
  }

  // '바로 생성' — 추출 결과 확인·보정(설문) 단계를 건너뛰고 파싱 직후 즉시 생성.
  // 품질보다 속도 우선 경로(추출이 비어도 그대로 생성). 기존 '추출하기→보정→생성' 경로는 그대로 유지.
  const handleQuickGenerate = async () => {
    if (!nlText.trim()) return
    if (!masterReference) {
      setSubmitError('마스터 참고자료가 없습니다. 관리자에게 문의하세요.')
      return
    }
    setStep('parsing')
    setSubmitError(null)
    setIngestWarning(null)
    setLengthWarn(null)
    const warning = lengthWarning(nlText)
    if (warning) setLengthWarn(warning)
    let ext = { scenarios: [] }
    try {
      const data = await request(API_ENDPOINTS.NL_SCENARIO_PARSE, {
        method: 'POST',
        body: { text: nlText },
        loadingMessage: '시나리오 분석 중…',
      })
      ext = data || { scenarios: [] }
    } catch (err) {
      // 파싱 실패도 빈 추출로 흡수 — 그대로 바로 생성(완성도 낮아도 진행), 단 실패 사유는 배너로 알린다
      setIngestWarning(summarizeIngestFailures([{ name: '자연어 텍스트', reason: err?.message ?? '자연어 시나리오 분석에 실패했습니다.' }], 1))
    }
    const quickName = ext.botName || ''
    const quickScenarios = mapExtractedToScenarios(ext.scenarios || [], template)
    setBotName(quickName)
    setScenarios(quickScenarios)

    // 시나리오가 하나도 없으면 생성하지 않음 — 보정 단계로 보내 직접 추가하게 유도
    if (!hasUsableScenario(quickScenarios)) {
      setSubmitError('추출된 시나리오가 없어 바로 생성할 수 없습니다. 시나리오를 1개 이상 추가한 뒤 생성하세요.')
      setStep('preview')
      return
    }

    setIsSubmitting(true)
    try {
      // setState는 비동기라 방금 파싱한 로컬 값으로 responses 구성(상태 반영 대기 안 함)
      const responses = buildResponsesFromPreview(botNameQ?.id, scenarioQ?.id, quickName, quickScenarios)
      const result = await createResult(responses, masterReference.id, user?.email, confirmedEsd, undefined, 'nl')
      setResultId(result.id)
      setStep('preview')
      setShowCompletionModal(true)
    } catch (e) {
      // 생성 실패 시 보정 단계로 폴백 — 사용자가 확인·수정 후 재시도
      setSubmitError(`생성 중 오류가 발생했습니다: ${e.message}`)
      setStep('preview')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMultiRoute = async () => {
    setStep('parsing')
    setMultiRoutingError(null)
    setIngestWarning(null)
    setLengthWarn(null)
    const ingestFailures = []
    try {
      const routable = multiFiles.filter((f) => f.kind !== 'ambiguous')
      // 불명확(ambiguous)으로 분류된 파일은 처리되지 않는다 — 총 개수에만 잡히고 조용히 빠지면
      // 실패 0 + ambiguous 1일 때 배너가 null이 되어 아무 표시도 없다. 실패 목록에 함께 넣는다.
      for (const f of multiFiles) {
        if (f.kind === 'ambiguous') {
          ingestFailures.push({ name: f.file?.name ?? f.name, reason: '종류를 판정하지 못해 제외했습니다' })
        }
      }
      const esdFiles = routable.filter((f) => f.kind === 'esd')
      const apiFiles = routable.filter((f) => f.kind === 'api')
      const scenarioFiles = routable.filter((f) => f.kind === 'scenario')

      // ESD: 엑셀 시트 전체 추출
      const esdSheetsNested = await Promise.all(
        esdFiles.map(async ({ file }) => {
          try {
            const sheetNames = await getFileSheetNames(file)
            const sheets = await Promise.all(
              sheetNames.map(async (sheetName) => {
                const { headers, rows } = await parseFileSheet(file, sheetName)
                return { schemaName: sheetName, headers, rows }
              })
            )
            return sheets
          } catch (err) {
            ingestFailures.push({ name: file.name, reason: err?.message ?? 'ESD 시트를 읽지 못했습니다.' })
            return []
          }
        })
      )
      const esdSheets = esdSheetsNested.flat()

      // API: extractApiDefsFromFile 경유 def 추출
      const callApiDocParse = (text) =>
        request(API_ENDPOINTS.API_DOC_PARSE, { method: 'POST', body: { text } })
      const apiDefsResults = await Promise.all(
        apiFiles.map(({ file }) =>
          extractApiDefsFromFile(file, { extractText: extractFileText, callApiDocParse })
        )
      )
      const apiDefs = apiDefsResults.flatMap((r, i) => {
        if (r.error) ingestFailures.push({ name: apiFiles[i].file.name, reason: r.error })
        return r.defs ?? []
      })

      // Scenario: extractFileText → POC_DOC_PARSE → Extracted
      // 파일별로 텍스트를 추출해 개별 호출로 보내는 구조라(합쳐서 한 번에 보내지 않음),
      // 실제 LLM 호출 한 건이 받는 최대 텍스트(가장 긴 파일 또는 nlText)를 기준으로 경고한다.
      const scenarioDocs = []
      let longestScenarioText = ''
      for (const { file } of scenarioFiles) {
        try {
          const text = await extractFileText(file)
          if (text.length > longestScenarioText.length) longestScenarioText = text
          const data = await request(API_ENDPOINTS.POC_DOC_PARSE, {
            method: 'POST',
            body: { text },
            loadingMessage: '문서 분석 중…',
          })
          if (data) scenarioDocs.push(data)
        } catch (err) {
          ingestFailures.push({ name: file.name, reason: err?.message ?? '문서를 읽지 못했습니다.' })
        }
      }

      const { sessionEsd, scenarioDraft } = assembleFromClassified({ esdSheets, apiDefs, scenarioDocs })

      // NL 텍스트 병합 (T9 핵심 — POC와의 차이: NL_SCENARIO_PARSE 병행)
      if (nlText.trim()) {
        let nlExt = { scenarios: [] }
        try {
          const data = await request(API_ENDPOINTS.NL_SCENARIO_PARSE, {
            method: 'POST',
            body: { text: nlText },
            loadingMessage: '시나리오 분석 중…',
          })
          nlExt = data || { scenarios: [] }
        } catch (err) {
          // NL 파싱 실패 시 빈 Extracted로 흡수해 계속 진행하되, 실패 사유는 다른 파일 실패와 함께 배너로 알린다
          ingestFailures.push({ name: '자연어 텍스트', reason: err?.message ?? '자연어 시나리오 분석에 실패했습니다.' })
        }
        const mergedBotName =
          (nlExt.botName && nlExt.botName !== '')
            ? nlExt.botName
            : (scenarioDraft?.botName && scenarioDraft.botName !== '')
              ? scenarioDraft.botName
              : ''
        const nlScenarios = mapExtractedToScenarios(nlExt.scenarios || [], template)
        const draftScenarios = scenarioDraft
          ? mapExtractedToScenarios(scenarioDraft.scenarios || [], template)
          : []
        setBotName(mergedBotName)
        setScenarios([...nlScenarios, ...draftScenarios])
      } else if (scenarioDraft) {
        setBotName(scenarioDraft.botName || '')
        setScenarios(mapExtractedToScenarios(scenarioDraft.scenarios || [], template))
      } else {
        setBotName('')
        setScenarios([])
      }

      const longestBoundText =
        nlText.length > longestScenarioText.length ? nlText : longestScenarioText
      const multiLengthWarning = lengthWarning(longestBoundText)
      if (multiLengthWarning) setLengthWarn(multiLengthWarning)

      setIngestWarning(summarizeIngestFailures(ingestFailures, multiFiles.length + (nlText.trim() ? 1 : 0)))

      if (sessionEsd) {
        setPendingEsd(sessionEsd)
        setStep('esd-confirm')
      } else {
        setStep('preview')
      }
    } catch (err) {
      setMultiRoutingError(err.message || '파일 처리 중 오류가 발생했습니다.')
      setStep('input')
    }
  }

  const handleSubmit = async () => {
    if (!masterReference) {
      setSubmitError('마스터 참고자료가 없습니다. 관리자에게 문의하세요.')
      return
    }
    if (!hasUsableScenario(scenarios)) {
      setSubmitError('시나리오가 하나도 없습니다. 시나리오를 1개 이상 추가한 뒤 생성하세요.')
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const responses = buildResponsesFromPreview(botNameQ?.id, scenarioQ?.id, botName, scenarios)
      if (mappingToggle && confirmedEsd) {
        // 블록 C: 1차 생성 → MappingStep 대기
        const draft = await createResult(responses, masterReference.id, user?.email, confirmedEsd, undefined, 'nl')
        const esdMappingFromDraft = draft.bundle?.esd_mapping
        if (esdMappingFromDraft) {
          setDraft1ResultId(draft.id)
          setProposedMapping(esdMappingFromDraft)
          setIsSubmitting(false)
          setStep('mapping_confirm')
          return
        }
        // esd_mapping 없으면 1차 결과 바로 사용 (graceful fallback)
        setResultId(draft.id)
        setShowCompletionModal(true)
      } else {
        // 블록 B: 단일 pass
        const result = await createResult(responses, masterReference.id, user?.email, confirmedEsd, undefined, 'nl')
        setResultId(result.id)
        setShowCompletionModal(true)
      }
    } catch (e) {
      setSubmitError(`생성 중 오류가 발생했습니다: ${e.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMappingConfirm = async (confirmedMapping) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const responses = buildResponsesFromPreview(botNameQ?.id, scenarioQ?.id, botName, scenarios)
      const result = await createResult(responses, masterReference.id, user?.email, confirmedEsd, confirmedMapping, 'nl')
      setResultId(result.id)
      setMappingFallback(false)
      setShowCompletionModal(true)
    } catch (e) {
      // 2차 실패 시 1차 결과로 폴백 (AC5 격리)
      setSubmitError(`2차 생성 중 오류가 발생했습니다: ${e.message}`)
      if (draft1ResultId) {
        setResultId(draft1ResultId)
        setMappingFallback(true)
        setShowCompletionModal(true)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMappingCancel = () => {
    // 1차 결과(블록 B)를 그대로 사용
    setResultId(draft1ResultId)
    setMappingFallback(false)
    setShowCompletionModal(true)
  }

  const handleViewResults = () => {
    setShowCompletionModal(false)
    navigate(`/results/${resultId}`)
  }

  const handleReset = () => {
    setShowCompletionModal(false)
    setMappingFallback(false)
    setStep('input')
    setNlText('')
    setBotName('')
    setScenarios([])
    setSubmitError(null)
    setEsdToggle(false)
    setConfirmedEsd(null)
    setMappingToggle(false)
    setProposedMapping(null)
    setDraft1ResultId(null)
    setMultiFiles([])
    setPendingEsd(null)
    setMultiRoutingError(null)
    setIngestWarning(null)
    setLengthWarn(null)
    setMultiResetKey((k) => k + 1)
  }

  // 블록 C: 매핑 확정 단계
  if (step === 'mapping_confirm') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-semibold text-[#1F2937]">매핑 확정 후 2차 생성</h2>
        </div>
        {isSubmitting ? (
          <p className="text-sm text-[#6B7280] text-center py-10">2차 생성 중… 잠시만 기다려 주세요</p>
        ) : (
          <>
            {submitError && (
              <div className="mb-4 p-4 bg-[#FEE2E2] border border-[#EF4444] rounded-lg text-[#EF4444] text-sm">
                {submitError}
              </div>
            )}
            <MappingStep
              proposedMapping={proposedMapping}
              onConfirm={handleMappingConfirm}
              onCancel={handleMappingCancel}
            />
          </>
        )}
        <Modal isOpen={showCompletionModal} onClose={handleReset} title="생성 완료" size="md">
          <div className="text-center">
            <p className="text-xl font-semibold text-primary-500 mb-4">축하합니다!</p>
            <p className="text-base text-[#6B7280] mb-8">자연어 설명 기반으로 생성이 완료되었습니다.</p>
            {mappingFallback && (
              <p className="text-sm text-[#EF4444] mb-4">2차 생성이 실패해 1차 결과를 보여줍니다.</p>
            )}
            <div className="flex flex-col gap-4">
              <Button variant="secondary" className="w-full" onClick={handleReset}>새로 생성</Button>
              <Button variant="default" className="w-full" onClick={handleViewResults}>결과 보기</Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  if (step === 'esd-confirm') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-semibold text-[#1F2937]">ESD·API 확인 · 보정</h2>
        </div>
        {ingestWarningBanner}
        {lengthWarnBanner}
        <EsdFrontStage
          initialEsdJson={pendingEsd}
          onConfirm={(esdJson) => {
            setConfirmedEsd(esdJson)
            setStep('preview')
          }}
          onCancel={() => setStep('preview')}
        />
      </div>
    )
  }

  const hasRoutableFiles = multiFiles.some((f) => f.kind !== 'ambiguous')
  const hasAmbiguousOnly = multiFiles.length > 0 && multiFiles.every((f) => f.kind === 'ambiguous')
  const handleAction = hasRoutableFiles ? handleMultiRoute : handleParse
  const canSubmit = hasRoutableFiles || !!nlText.trim()

  if (step === 'input' || step === 'parsing') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-[#1F2937]">자연어로 생성</h2>
          <button onClick={() => navigate('/survey')} className="ml-auto text-sm text-[#6B7280] hover:text-primary-500" disabled={step === 'parsing'}>
            설문으로 생성 (상세) →
          </button>
        </div>

        {/* ESD·API 선행 정의 토글 (기본 off) */}
        <div className="flex items-center gap-2 mb-5">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[#6B7280]">
            <input
              type="checkbox"
              checked={esdToggle}
              onChange={(e) => { setEsdToggle(e.target.checked); if (!e.target.checked) { setConfirmedEsd(null); setMappingToggle(false) } }}
              disabled={step === 'parsing'}
              className="rounded border-[#D1D5DB]"
            />
            ESD 및 API 먼저 정의
          </label>
        </div>

        {/* ESD 패널 (토글 on 시) */}
        {esdToggle && (
          <div className="mb-6">
            {confirmedEsd ? (
              <div className="rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] px-4 py-3 text-sm text-[#065F46]">
                <div className="flex items-center justify-between">
                  <span>ESD·API 확정됨 — 스키마 {confirmedEsd.entities?.length ?? 0}개{(confirmedEsd.apis?.length ?? 0) > 0 ? `, API ${confirmedEsd.apis.length}개` : ''}</span>
                  <button
                    onClick={() => { setConfirmedEsd(null); setMappingToggle(false) }}
                    disabled={step === 'parsing'}
                    className="text-xs text-[#059669] hover:underline disabled:opacity-50"
                  >
                    변경
                  </button>
                </div>
                {/* 생성 전 매핑 확정 토글 (ESD 확정 시만 표시, 기본 off) */}
                <div className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#059669]">
                    <input
                      type="checkbox"
                      checked={mappingToggle}
                      onChange={(e) => setMappingToggle(e.target.checked)}
                      disabled={step === 'parsing'}
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

        {/* 다중 파일 수집 (신규) */}
        <div className="bg-white rounded-lg p-6 shadow-sm mb-4">
          <label className="block text-sm font-medium text-[#1F2937] mb-2">파일 첨부</label>
          <p className="text-xs text-[#6B7280] mb-3">
            ESD·API·시나리오 파일을 올리면 종류별로 자동 분류해 자연어와 함께 추출합니다.
          </p>
          <MultiFileUpload
            key={multiResetKey}
            onChange={({ files }) => setMultiFiles(files)}
            disabled={step === 'parsing'}
          />
          {hasAmbiguousOnly && (
            <p className="mt-2 text-xs text-[#F59E0B]">
              모든 파일이 불명확(ambiguous)으로 분류됐습니다. 배지를 클릭해 종류를 재지정하세요.
            </p>
          )}
          {multiRoutingError && (
            <div className="mt-3 p-3 bg-[#FEE2E2] border border-[#EF4444] rounded-lg text-[#EF4444] text-xs">
              {multiRoutingError}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <label className="block text-sm font-medium text-[#1F2937] mb-2">시나리오 설명</label>
          <p className="text-xs text-[#6B7280] mb-3">
            원하는 챗봇을 자연어로 설명하면 챗봇 정보와 시나리오를 자동으로 추출합니다.
            (예: "배송 조회하고 주문 취소도 되는 상담봇, 배송은 송장번호 받아서 조회")
          </p>
          <textarea
            className="w-full h-64 p-3 border border-[#E5E7EB] rounded-lg text-sm resize-y focus:outline-none focus:border-primary-500"
            placeholder="원하는 챗봇과 시나리오를 자유롭게 설명해 주세요..."
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            disabled={step === 'parsing'}
          />
        </div>

        {lengthWarnBanner}

        <div className="flex gap-3 justify-between">
          <Button variant="outline" onClick={handleReset} disabled={step === 'parsing'}>
            취소
          </Button>
          <div className="flex gap-3">
            {!hasRoutableFiles && (
              <Button
                variant="secondary"
                onClick={handleQuickGenerate}
                disabled={!nlText.trim() || step === 'parsing' || isSubmitting}
                title="추출 결과 확인·보정(설문) 단계를 건너뛰고 즉시 생성합니다 (품질보다 속도 우선)"
              >
                {step === 'parsing' || isSubmitting ? '생성 중...' : '바로 생성'}
              </Button>
            )}
            <Button onClick={handleAction} disabled={!canSubmit || step === 'parsing'}>
              {step === 'parsing' ? '추출 중...' : '추출하기'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // step === 'preview'
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setStep('input')} className="text-sm text-[#6B7280] hover:text-primary-500">
          ← 다시 입력
        </button>
        <h2 className="text-lg font-semibold text-[#1F2937]">추출 결과 확인 · 보정</h2>
      </div>

      <p className="text-sm text-[#6B7280] mb-6">
        추출된 정보를 확인하고 필요한 항목을 보정한 뒤 생성하세요. 빈 항목은 직접 채울 수 있습니다.
      </p>

      {ingestWarningBanner}
      {lengthWarnBanner}

      <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
        <label className="block text-sm font-medium text-[#1F2937] mb-2">챗봇 이름</label>
        <input
          type="text"
          className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-primary-500"
          placeholder="챗봇 이름 입력"
          value={botName}
          onChange={(e) => setBotName(e.target.value)}
        />
      </div>

      <ScenarioQuestionCard
        question={{
          text: '시나리오',
          description: '자연어 설명에서 추출된 시나리오를 확인·보정하세요.',
        }}
        template={template}
        value={scenarios}
        onChange={setScenarios}
      />

      {submitError && (
        <div className="mb-4 p-4 bg-[#FEE2E2] border border-[#EF4444] rounded-lg text-[#EF4444] text-sm">
          {submitError}
        </div>
      )}

      {!hasUsableScenario(scenarios) && (
        <p className="mb-3 text-sm text-[#F59E0B]">시나리오를 1개 이상 추가해야 생성할 수 있습니다.</p>
      )}

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={() => setStep('input')}>
          다시 입력
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || !hasUsableScenario(scenarios)}>
          {isSubmitting ? '생성 중...' : '이 내용으로 생성'}
        </Button>
      </div>

      <Modal isOpen={showCompletionModal} onClose={handleReset} title="생성 완료" size="md">
        <div className="text-center">
          <p className="text-xl font-semibold text-primary-500 mb-4">축하합니다!</p>
          <p className="text-base text-[#6B7280] mb-8">자연어 설명 기반으로 생성이 완료되었습니다.</p>
          {mappingFallback && (
            <p className="text-sm text-[#EF4444] mb-4">2차 생성이 실패해 1차 결과를 보여줍니다.</p>
          )}
          <div className="flex flex-col gap-4">
            <Button variant="secondary" className="w-full" onClick={handleReset}>
              새로 생성
            </Button>
            <Button variant="default" className="w-full" onClick={handleViewResults}>
              결과 보기
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default NlScenarioFlow

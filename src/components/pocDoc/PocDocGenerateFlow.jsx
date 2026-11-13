import { useState, useRef } from 'react'
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
import { extractFileText } from './extractFileText'
import { SCENARIO_DOC_ACCEPT } from '../../lib/fileAccept.js'
import EsdFrontStage from '../esd/EsdFrontStage.jsx'
import MappingStep from '../mapping/MappingStep.jsx'
import MultiFileUpload from '../ingest/MultiFileUpload'
import { assembleFromClassified } from '../../lib/ingest/assembleFromClassified'
import { summarizeIngestFailures } from '../../lib/ingest/summarizeIngestFailures'
import { extractApiDefsFromFile } from '../../lib/apiDoc/extractApiDefsFromFile'
import { getFileSheetNames, parseFileSheet } from '../../lib/parseExcelFile'
import { scanColumns } from '../../lib/pocDoc/scanColumns'
import { buildCoverage } from '../../lib/pocDoc/buildCoverage'
import { suggestField } from '../../lib/pocDoc/termDictionary'
import TermMappingStep from './TermMappingStep.jsx'
import { withFieldOverrides } from '../../lib/questions/fieldOverrides'

const FALLBACK_TEMPLATE = { name: '시나리오 템플릿', fields: [] }

/**
 * 표의 열 이름들을 사전(termEntries)으로 자동 매칭해 커버리지용 매핑을 만든다.
 * "건너뛰고 추출" 전용 — 사용자는 아무것도 확정하지 않았지만 서버의 레이아웃 인식 지침은
 * 이 사전을 그대로 쓰므로, 사전이 맞힌 열을 커버리지에서 "반영 안 됨"으로 표시하면
 * 멀쩡한 정의서를 "절반을 버렸다"고 오해하게 만든다.
 * ⚠ 반환값은 커버리지 계산에만 쓴다 — 서버로 보내는 columnMapping(확정 매핑)이 아니다.
 */
function dictionaryMappingOf(tables, entries) {
  const out = []
  const seen = new Set()
  for (const t of tables || []) {
    for (const c of t.headerRow || []) {
      if (seen.has(c)) continue
      seen.add(c)
      const field = suggestField(c, entries)
      if (field) out.push({ column: c, field, source: 'dictionary' })
    }
  }
  return out
}

export function PocDocGenerateFlow({ onBack }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { questions } = useQuestions()
  const { templates } = useTemplates()
  const { masterReference } = useReferences()
  const { createResult } = useResults()
  const { request } = useApi()

  // 'input' | 'parsing' | 'esd-confirm' | 'preview'
  const [step, setStep] = useState('input')
  const [docText, setDocText] = useState('')

  // preview edit state
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
  // 블록 C: 생성 전 매핑 확정 (옵트인, 기본 off)
  const [mappingToggle, setMappingToggle] = useState(false)
  const [step2, setStep2] = useState('idle')  // 'idle' | 'mapping_confirm'
  const [proposedMapping, setProposedMapping] = useState(null)
  const [draft1ResultId, setDraft1ResultId] = useState(null)

  // 표 열 매핑 확인 (Task 8: term-mapping-coverage)
  const [scannedTables, setScannedTables] = useState([])
  const [termEntries, setTermEntries] = useState([])   // 사전 자동 제안용(못 받으면 빈 배열)
  const [pendingDocText, setPendingDocText] = useState('')
  // 문서 추출 커버리지(Task 9) — 표가 있는 문서에서만 채운다. 실패 경로·리셋에서는 반드시 null로 되돌린다.
  const [docCoverage, setDocCoverage] = useState(null)

  const [isExtracting, setIsExtracting] = useState(false)
  const [fileError, setFileError] = useState(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const fileInputRef = useRef(null)

  // 다중 파일 경로 상태
  const [multiFiles, setMultiFiles] = useState([])
  const [pendingEsd, setPendingEsd] = useState(null)
  const [multiRoutingError, setMultiRoutingError] = useState(null)
  const [multiResetKey, setMultiResetKey] = useState(0)
  // 다중 파일 중 일부가 실패했을 때 보여줄 요약 (조용히 건너뛰지 않고 사용자에게 알린다)
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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsExtracting(true)
    setFileError(null)
    setSelectedFileName(file.name)
    try {
      const text = await extractFileText(file)
      setDocText(text)
    } catch (err) {
      setFileError(err.message || '파일 처리 중 오류가 발생했습니다.')
      setSelectedFileName('')
    } finally {
      setIsExtracting(false)
      e.target.value = ''
    }
  }

  // 실제 추출 요청(열 매핑 확정/건너뜀 이후, 또는 표가 없어 바로 진행하는 경우) — handleParse에서 분리
  //
  // ⚠ mapping(서버로 가는 "사용자 확정 매핑")과 coverageMapping(커버리지 리포트용)은 **다른 값**이다.
  //    "건너뛰고 추출"에서는 사용자가 아무것도 확정하지 않았으므로 서버에는 undefined를 보내야 하지만
  //    (확정하지 않은 것을 강제 지침으로 프롬프트에 주입하면 안 된다), 사전이 자동으로 맞힌 열은
  //    실제로 추출에 쓰였으므로 커버리지에서는 "반영 안 됨"이 되면 안 된다.
  const runExtraction = async (text, mapping, coverageMapping = mapping) => {
    setStep('parsing')
    setIngestWarning(null)
    setLengthWarn(lengthWarning(text))
    try {
      const data = await request(API_ENDPOINTS.POC_DOC_PARSE, {
        method: 'POST',
        body: { text, columnMapping: mapping },
        loadingMessage: '문서 분석 중…',
      })
      const ext = data || { scenarios: [] }
      setBotName(ext.botName || '')
      const mapped = mapExtractedToScenarios(ext.scenarios || [], template)
      setScenarios(mapped)
      // ⚠ 표가 있을 때만 커버리지를 만든다. 줄글 문서에 빈 커버리지를 붙이면
      //    결과 상세에 "표 0개에서 시나리오 N개"라는 무의미한 블록이 뜬다.
      const tables = scanColumns(text)
      setDocCoverage(
        tables.length > 0
          ? buildCoverage({ tables, columnMapping: coverageMapping, scenarios: mapped })
          : null,
      )
    } catch (err) {
      // 오류가 나도 빈 미리보기로 흡수해 계속 진행하되(사용자가 채워 생성), 실패 사유는 배너로 보여준다
      setIngestWarning(summarizeIngestFailures([{ name: selectedFileName || '붙여넣은 문서', reason: err?.message ?? '문서 분석에 실패했습니다.' }], 1))
      setBotName('')
      setScenarios([])
      // 옛 커버리지가 새 결과에 붙으면 안 된다 — 실패 경로에서는 반드시 지운다.
      setDocCoverage(null)
    }
    setStep('preview')
  }

  const handleParse = async () => {
    if (!docText.trim()) return
    // 표가 있으면 열 매핑을 사람에게 확인받고, 없으면 지금처럼 바로 추출한다.
    const tables = scanColumns(docText)
    if (tables.length > 0) {
      // 사전 왕복(dictionaryOnly)도 네트워크다 — 여기서 화면을 바꾸지 않으면 사용자는
      // "추출하기"를 누르고 입력 화면 그대로를 본다(연타도 막히지 않는다).
      setStep('parsing')
      setScannedTables(tables)
      setPendingDocText(docText)
      // 매핑 화면의 자동 제안용 사전을 받는다 — 실패해도(마이그레이션 미적용 등) 매핑 화면은 떠야 하므로
      // 여기서 나는 오류는 무시하고 빈 배열로 진행한다(수동 지정만 가능).
      let entries = []
      try {
        const res = await request(API_ENDPOINTS.POC_DOC_PARSE, {
          method: 'POST', body: { dictionaryOnly: true }, loadingMessage: '용어 사전 확인 중…',
        })
        entries = res?.entries ?? []
      } catch {
        // 사전을 못 받아도 매핑 화면은 떠야 한다 — 자동 제안 없이 수동 지정만 하면 된다.
      }
      setTermEntries(entries)
      setStep2('term_mapping')
      return
    }
    await runExtraction(docText, undefined)
  }

  const handleMultiRoute = async () => {
    setStep('parsing')
    setMultiRoutingError(null)
    setIngestWarning(null)
    setLengthWarn(null)
    // 다중 파일 경로는 표 열 매핑을 거치지 않는다 — 이전에 단일 문서 경로에서 만든 커버리지가
    // 남아 있으면 무관한 결과에 붙는다.
    setDocCoverage(null)
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
      // 실제 LLM 호출 한 건이 받는 최대 텍스트(가장 긴 파일)를 기준으로 경고한다.
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
      const scenarioLengthWarning = lengthWarning(longestScenarioText)
      if (scenarioLengthWarning) setLengthWarn(scenarioLengthWarning)

      setIngestWarning(summarizeIngestFailures(ingestFailures, multiFiles.length))

      const { sessionEsd, scenarioDraft } = assembleFromClassified({ esdSheets, apiDefs, scenarioDocs })

      // 시나리오 미리보기 상태 세팅 (scenarioDraft 있으면)
      if (scenarioDraft) {
        setBotName(scenarioDraft.botName || '')
        setScenarios(mapExtractedToScenarios(scenarioDraft.scenarios || [], template))
      } else {
        setBotName('')
        setScenarios([])
      }

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
        const draft = await createResult(responses, masterReference.id, user?.email, confirmedEsd, undefined, 'doc', docCoverage)
        const esdMappingFromDraft = draft.bundle?.esd_mapping
        if (esdMappingFromDraft) {
          setDraft1ResultId(draft.id)
          setProposedMapping(esdMappingFromDraft)
          setIsSubmitting(false)
          setStep2('mapping_confirm')
          return
        }
        setResultId(draft.id)
        setShowCompletionModal(true)
      } else {
        // 블록 B: 단일 pass
        const result = await createResult(responses, masterReference.id, user?.email, confirmedEsd, undefined, 'doc', docCoverage)
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
      const result = await createResult(responses, masterReference.id, user?.email, confirmedEsd, confirmedMapping, 'doc', docCoverage)
      setResultId(result.id)
      setStep2('idle')
      setMappingFallback(false)
      setShowCompletionModal(true)
    } catch (e) {
      setSubmitError(`2차 생성 중 오류가 발생했습니다: ${e.message}`)
      if (draft1ResultId) {
        setResultId(draft1ResultId)
        setStep2('idle')
        setMappingFallback(true)
        setShowCompletionModal(true)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMappingCancel = () => {
    setResultId(draft1ResultId)
    setStep2('idle')
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
    setDocText('')
    setBotName('')
    setScenarios([])
    setSubmitError(null)
    setFileError(null)
    setSelectedFileName('')
    setEsdToggle(false)
    setConfirmedEsd(null)
    setMappingToggle(false)
    setStep2('idle')
    setProposedMapping(null)
    setDraft1ResultId(null)
    setScannedTables([])
    setTermEntries([])
    setPendingDocText('')
    setDocCoverage(null)
    setMultiFiles([])
    setPendingEsd(null)
    setMultiRoutingError(null)
    setIngestWarning(null)
    setLengthWarn(null)
    setMultiResetKey((k) => k + 1)
  }

  if (step === 'esd-confirm') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          {onBack && (
            <button onClick={onBack} className="text-sm text-[#6B7280] hover:text-primary-500">
              ← 설문으로 돌아가기
            </button>
          )}
          <h2 className="text-lg font-semibold text-[#1F2937]">ESD·API 확인 · 보정</h2>
        </div>
        {ingestWarningBanner}
        {lengthWarnBanner}
        <EsdFrontStage
          initialEsdJson={pendingEsd}
          onConfirm={(esdJson) => {
            setPendingEsd(esdJson)
            setStep('preview')
          }}
          onCancel={() => setStep('preview')}
        />
      </div>
    )
  }

  // 표 열 매핑 확인 단계 (추출 전 — 표가 있는 문서에서만 진입) — step2가 'term_mapping'이면
  // step('input'/'parsing')과 무관하게 이 화면을 우선 보여준다.
  if (step2 === 'term_mapping') {
    return (
      <div>
        {ingestWarningBanner}
        {lengthWarnBanner}
        <TermMappingStep
          tables={scannedTables}
          entries={termEntries}
          onConfirm={async (mapping) => { setStep2('idle'); await runExtraction(pendingDocText, mapping) }}
          onSkip={async () => {
            setStep2('idle')
            // 서버에는 undefined(확정 매핑 없음)를, 커버리지에는 사전이 맞힌 열을 넘긴다.
            await runExtraction(pendingDocText, undefined, dictionaryMappingOf(scannedTables, termEntries))
          }}
        />
      </div>
    )
  }

  const hasRoutableFiles = multiFiles.some((f) => f.kind !== 'ambiguous')
  const hasAmbiguousOnly =
    multiFiles.length > 0 && multiFiles.every((f) => f.kind === 'ambiguous')
  const handleAction = hasRoutableFiles ? handleMultiRoute : handleParse
  const canSubmit = hasRoutableFiles || !!docText.trim()

  if (step === 'input' || step === 'parsing') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          {onBack && (
            <button
              onClick={onBack}
              className="text-sm text-[#6B7280] hover:text-primary-500"
              disabled={step === 'parsing'}
            >
              ← 설문으로 돌아가기
            </button>
          )}
          <h2 className="text-lg font-semibold text-[#1F2937]">POC 문서로 생성</h2>
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
          <label className="block text-sm font-medium text-[#1F2937] mb-2">다중 파일 업로드</label>
          <p className="text-xs text-[#6B7280] mb-3">
            ESD·API·시나리오 파일을 한 번에 올리면 종류별로 자동 분류해 추출합니다.
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

        <div className="bg-white rounded-lg p-6 shadow-sm mb-4">
          <label className="block text-sm font-medium text-[#1F2937] mb-2">단일 파일 업로드</label>
          <p className="text-xs text-[#6B7280] mb-3">
            .docx · .xlsx · .pdf · .md · .txt 파일을 업로드하면 텍스트를 자동으로 추출합니다.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={SCENARIO_DOC_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={step === 'parsing' || isExtracting}
              className="px-4 py-2 text-sm border border-[#D1D5DB] rounded-lg text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExtracting ? '추출 중...' : '파일 선택'}
            </button>
            {selectedFileName && (
              <span className="text-sm text-[#6B7280] truncate max-w-xs">{selectedFileName}</span>
            )}
          </div>
          {fileError && (
            <div className="mt-3 p-3 bg-[#FEE2E2] border border-[#EF4444] rounded-lg text-[#EF4444] text-xs">
              {fileError}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <label className="block text-sm font-medium text-[#1F2937] mb-2">또는 직접 붙여넣기</label>
          <p className="text-xs text-[#6B7280] mb-3">
            마크다운·텍스트 형식의 POC 문서를 붙여넣으면 챗봇 정보와 시나리오를 자동으로 추출합니다.
          </p>
          <textarea
            className="w-full h-64 p-3 border border-[#E5E7EB] rounded-lg text-sm font-mono resize-y focus:outline-none focus:border-primary-500"
            placeholder="여기에 POC 문서 내용을 붙여넣으세요..."
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            disabled={step === 'parsing'}
          />
        </div>

        {lengthWarnBanner}

        <div className="flex gap-3 justify-between">
          {onBack ? (
            <Button variant="outline" onClick={onBack} disabled={step === 'parsing'}>
              취소
            </Button>
          ) : <span />}
          <Button onClick={handleAction} disabled={!canSubmit || step === 'parsing' || isExtracting}>
            {step === 'parsing' ? '추출 중...' : '추출하기'}
          </Button>
        </div>
      </div>
    )
  }

  // 블록 C: 매핑 확정 단계
  if (step2 === 'mapping_confirm') {
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
            <p className="text-base text-[#6B7280] mb-8">POC 문서 기반으로 생성이 완료되었습니다.</p>
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

  // step === 'preview'
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setStep('input')}
          className="text-sm text-[#6B7280] hover:text-primary-500"
        >
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
          description: 'POC 문서에서 추출된 시나리오를 확인·보정하세요.',
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
          <p className="text-base text-[#6B7280] mb-8">POC 문서 기반으로 생성이 완료되었습니다.</p>
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

export default PocDocGenerateFlow

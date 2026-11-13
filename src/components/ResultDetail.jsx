import { useParams, useNavigate } from 'react-router-dom'
import { downloadJson, downloadText, downloadCsv } from '../lib/downloadFile.js'
import { useEffect, useState } from 'react'
import { useResults } from '../context/ResultsContext'
import { useAuth } from '../context/AuthContext'
import { useQuestions } from '../context/QuestionsContext'
import { formatKST } from '../utils/datetime'
import { INPUT_TYPES, API_ENDPOINTS } from '../lib/constants'
import { resultBotName, resultMetaChips } from '../utils/resultMeta'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import FlowCanvas from './flow/FlowCanvas'
import EsdEditor from './esd/EsdEditor'
import EsdMappingView from './results/EsdMappingView'
import { esdSchemasToBundle } from '../lib/esdSchemasToBundle'
import { isSurveyEditable, isUploadedResult } from '../lib/resultEditGating'
import { toIntentsCsv, toEntitiesCsv } from '../lib/nlp/toNlpCsv'
import DiagramEditPanel from './results/DiagramEditPanel'
import ResultDialogEdit from './results/ResultDialogEdit'
import ResultSurveyEdit from './results/ResultSurveyEdit'
import { formatDuration } from '../lib/formatDuration'
import { isArchived, archiveErrorMessage } from '../lib/resultBundle/archiveFilter.js'
import { normalizeResult } from '../lib/resultBundle/normalizeResult.js'
import { derivationErrors } from '../lib/resultBundle/derivationErrors.js'
import { scenarioRootIds } from '../lib/flow/flowToScenarios'
import ScenarioAssetRegister from './results/ScenarioAssetRegister'
import { Button } from './common/Button'
import { describeFlow } from '../lib/scenario/describeStep'
import { findShadowedBranches, describeShadowed } from '../lib/flow/findShadowedBranches'
import { verificationStatus, VERIFICATION_LABELS } from '../lib/resultBundle/verification.js'

// 응답 값을 읽기 쉽게 렌더 (문자열/배열/객체 재귀)
function AnswerValue({ value }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">(없음)</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400">(없음)</span>
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 bg-white">
            {item && typeof item === 'object' ? (
              <AnswerValue value={item} />
            ) : (
              <span className="text-gray-800 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{String(item)}</span>
            )}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') {
    return (
      <div className="min-w-0 space-y-1">
        {Object.entries(value).map(([k, v]) => {
          const nested = v && typeof v === 'object'
          return (
            <div key={k} className="min-w-0 text-sm">
              <span className="font-medium text-gray-700 break-words">{k}: </span>
              {nested ? (
                <div className="ml-3 mt-1 min-w-0">
                  <AnswerValue value={v} />
                </div>
              ) : (
                <span className="text-gray-800 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {v === '' || v === null || v === undefined ? '(없음)' : String(v)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  return <span className="text-gray-800 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{String(value)}</span>
}

// 시나리오 이름 필드 키(scenarioFields.js와 동일) — 헤더로 끌어올려 카드별 식별에 쓴다.
const SCENARIO_NAME_FIELD = '시나리오 이름'

// TEMPLATED(시나리오 배열) 응답 전용 렌더 — 시나리오마다 번호 배지 + 이름 헤더로 구분.
// 이름은 헤더로 올리고, _로 시작하는 내부 플래그(_tested 등)는 본문에서 숨긴다.
// 헤더 클릭으로 개별 접기, 2개 이상이면 '전체 접기/펼치기' 제공(기본은 모두 접힘).
function ScenarioAnswer({ scenarios }) {
  const [collapsed, setCollapsed] = useState(() => new Set(scenarios.map((_, i) => i)))
  const toggle = (i) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  const allCollapsed = scenarios.length > 0 && collapsed.size === scenarios.length
  const toggleAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(scenarios.map((_, i) => i)))

  return (
    <div className="space-y-4">
      {scenarios.length > 1 && (
        <div className="flex justify-end">
          <button type="button" onClick={toggleAll} className="text-xs text-primary-500 hover:underline">
            {allCollapsed ? '전체 펼치기' : '전체 접기'}
          </button>
        </div>
      )}
      {scenarios.map((scenario, i) => {
        const isObj = scenario && typeof scenario === 'object' && !Array.isArray(scenario)
        const name = isObj ? String(scenario[SCENARIO_NAME_FIELD] || '').trim() : ''
        // 흐름(단계)이 있으면 순서대로 따로 보여주고, 단계에서 파생된 기존 키(수집 정보·외부 연동·분기)는 숨긴다(중복 방지).
        const steps = isObj && Array.isArray(scenario['단계']) ? scenario['단계'] : null
        const hidden = new Set([SCENARIO_NAME_FIELD, ...(steps ? ['단계', '수집 정보', '외부 연동', '분기'] : [])])
        const fields = isObj
          ? Object.entries(scenario).filter(([k]) => !hidden.has(k) && !k.startsWith('_'))
          : []
        const isCollapsed = collapsed.has(i)
        return (
          <div key={i} className="bg-white border border-gray-200 border-l-4 border-l-primary-500 rounded-md overflow-hidden">
            {/* 헤더(클릭 시 접기/펼치기): 번호 배지 + 시나리오 이름 + 셰브론 */}
            <button
              type="button"
              onClick={() => toggle(i)}
              className={`w-full flex items-center gap-3 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100/60 transition-colors ${isCollapsed ? '' : 'border-b border-gray-100'}`}
            >
              <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-primary-500 text-white text-sm font-bold">
                {i + 1}
              </span>
              <span className="flex-1 font-semibold text-gray-900 break-words [overflow-wrap:anywhere]">
                {name || `시나리오 ${i + 1}`}
              </span>
              <ChevronDown className={`flex-shrink-0 h-4 w-4 text-primary-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
            </button>
            {/* 본문: 이름 제외 나머지 필드 */}
            {!isCollapsed && (
              <div className="px-4 py-3 space-y-3">
                {steps && steps.length > 0 && (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-500 mb-1">흐름</p>
                    <ol className="space-y-1 text-sm text-gray-800">
                      {/* 갈래 하위 흐름은 들여써서 그 갈래 아래에 */}
                      {describeFlow(steps).map((line, k) => (
                        <li key={k} style={{ paddingLeft: `${line.depth * 1.25}rem` }} className={`break-words [overflow-wrap:anywhere] ${line.label.startsWith('갈래') ? 'text-xs font-semibold text-amber-700' : ''}`}>
                          {line.label} {line.text}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {isObj ? (
                  fields.length === 0 && !(steps && steps.length) ? (
                    <p className="text-sm text-gray-400">(입력 항목 없음)</p>
                  ) : (
                    fields.map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 mb-1 break-words">{k}</p>
                        <AnswerValue value={v} />
                      </div>
                    ))
                  )
                ) : (
                  <AnswerValue value={scenario} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ESD 스키마 1개를 보여주고 복사/다운로드 (DialogFlow ESD에 import용)
function EsdSchemaCard({ schema }) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(schema, null, 2)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch (e) { console.error(e) }
      document.body.removeChild(ta)
    }
  }
  const download = () => downloadText(`${schema.name || 'esd'}_schema.json`, text, 'application/json')
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 mb-3">
      <div className="flex justify-between items-center mb-2">
        <p className="font-semibold text-gray-900">{schema.name} <span className="text-xs text-gray-500 font-normal">({schema.fields?.length || 0}개 필드)</span></p>
        <div className="flex gap-2">
          <Button onClick={copy} variant="outlinePrimary" size="sm">{copied ? '복사됨 ✓' : '복사'}</Button>
          <Button onClick={download} size="sm">다운로드</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {(schema.fields || []).map((f, i) => (
          <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
            {f.name}:{f.type}{f.key ? ' 🔑' : ''}{f.crypt === 'true' ? ' 🔒' : ''}
          </span>
        ))}
      </div>
      <pre className="bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-60 text-xs">{text}</pre>
    </div>
  )
}

export default function ResultDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getResultById, updateResultEsd, setResultArchived, setResultVerified } = useResults()
  const { user, isAdmin } = useAuth()
  // 보관 표시는 테스터(본인 결과 — RLS로 본인 것만 보인다)와 관리자(전체)가 한다.
  // 2026-10-26 사용자 결정: "관리자는 다 볼 수 있게" — v0.10.0의 '본인 결과에만' 제한을 관리자에게는 풀었다.
  //    관리자 저장은 admin-results PATCH(v0.11.0 항목 6a, _shared/resultPatch.ts)가 처리한다.
  const canArchive = !!user || isAdmin
  // (관리자 화면은 테스터 세션이 없어 user가 비므로 user만 보면 관리자에게 버튼이 숨는다 — v0.16.0 실제 사례.)
  const canVerify = canArchive
  const { questions } = useQuestions()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [jsonView, setJsonView] = useState('json') // 'json' | 'diagram'
  const [diagramEdit, setDiagramEdit] = useState(false)
  const [esdModalOpen, setEsdModalOpen] = useState(false)
  const [deriving, setDeriving] = useState('')      // '' | 'nlp' | 'esd'
  const [deriveMsg, setDeriveMsg] = useState('')
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState('')

  const handleToggleArchive = async () => {
    setArchiveBusy(true)
    setArchiveError('')
    try {
      const next = await setResultArchived(result.id, !isArchived(result))
      setResult(next)
    } catch (e) {
      setArchiveError(archiveErrorMessage(e))
    } finally {
      setArchiveBusy(false)
    }
  }

  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // 검증 표시는 사람이 솔루션에서 돌려 본 뒤에만 단다 — 자동으로 올리는 경로는 없다(v0.16.0 항목 2).
  // 'stale'(검증 후 수정됨)에서 누르면 지금 흐름으로 다시 검증 표시한다.
  const handleToggleVerified = async () => {
    setVerifyBusy(true)
    setVerifyError('')
    try {
      setResult(await setResultVerified(result.id, verificationStatus(result) !== 'verified'))
    } catch (e) {
      setVerifyError(`검증 표시를 저장하지 못했습니다: ${e?.message || e}`)
    } finally {
      setVerifyBusy(false)
    }
  }

  // 업로드 봇 자산 역파생 — generation_tiers만 갱신되고 generated_json은 그대로다.
  const runDerive = async (kind) => {
    setDeriving(kind); setDeriveMsg('')
    try {
      // 앱 규약(useApi): 세션이 있으면 사용자 토큰, 없으면 anon key.
      // 빈 Bearer를 보내면 Edge Function 플랫폼의 JWT 검증에서 401이 난다(master 관리자 경로).
      const { data: { session } } = await supabase.auth.getSession()
      const bearer = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(API_ENDPOINTS.DERIVE_ASSETS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ result_id: result.id, kind }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setDeriveMsg(body?.error || `실패 (${res.status})`); return }
      // ⚠ 이 경로는 ResultsContext를 우회해 직접 fetch하므로 **정규화를 직접 해야 한다**.
      // 빠뜨리면 result.bundle이 undefined가 되어, 역파생 직후 화면이 보관 상태·자산 개수·
      // ESD/NLP 섹션을 전부 '없음'으로 잘못 보인다(DB는 멀쩡한데 화면만 틀린다).
      setResult(normalizeResult(body.result))
      setDeriveMsg(kind === 'nlp'
        ? `인텐트 ${body.summary.intents}종 · 어터런스 ${body.summary.utterances}개 · 엔티티 ${body.summary.entities}종 생성`
        : `ESD 스키마 ${body.summary.schemas}종 추출`)
    } catch (e) {
      setDeriveMsg(e.message || '오류가 발생했습니다')
    } finally {
      setDeriving('')
    }
  }

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const data = await getResultById(id)
        if (!data) {
          setError('결과 데이터를 찾을 수 없습니다')
          return
        }
        setResult(data)
      } catch (e) {
        console.error('Error fetching result:', e)
        setError(e.message || '결과를 불러오는 중 오류가 발생했습니다')
      } finally {
        setLoading(false)
      }
    }
    fetchResult()
  }, [id, getResultById])

  const handleDownload = () => {
    if (!result) return
    // 파일명은 봇 이름으로 — id 조각은 알아보기 어렵다(파일명 불가 문자만 치환, 이름 없으면 id 폴백).
    const botName = String(result.generated_json?.name || '').replace(/[\\/:*?"<>|]/g, '_').trim()
    downloadJson(`dialogflow-${botName || result.id.slice(0, 8)}.json`, result.generated_json)
  }


  const handleCopy = async () => {
    if (!result?.generated_json) return
    const text = JSON.stringify(result.generated_json, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드 API 미지원 폴백
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (e) {
        console.error('복사 실패:', e)
      }
      document.body.removeChild(ta)
    }
  }

  const handleRegenerate = () => {
    navigate('/', { state: { initialAnswers: result?.responses || {} } })
  }

  if (loading) return <div className="text-center py-12">로딩 중...</div>
  if (error) return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <button onClick={() => navigate('/results')} className="mb-6 px-4 py-2 text-blue-600 hover:underline">← 돌아가기</button>
      <div className="text-center py-12 text-red-600">
        <p className="text-lg font-semibold mb-2">오류 발생</p>
        <p>{error}</p>
      </div>
    </div>
  )
  if (!result) return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <button onClick={() => navigate('/results')} className="mb-6 px-4 py-2 text-blue-600 hover:underline">← 돌아가기</button>
      <div className="text-center py-12 text-gray-600">결과를 찾을 수 없습니다</div>
    </div>
  )

  const generatedJson = result.generated_json
  // 가려진 갈래 — 저장값(generation_tiers)이 아니라 현재 flow로 계산한다(업로드·편집 결과도 같은 기준).
  const shadowedBranches = generatedJson ? findShadowedBranches(generatedJson) : []
  const verifyStatus = verificationStatus(result)
  const responses = result.responses || {}
  const esdSchemas = result.bundle?.esd_schemas || []
  const apiDefs = result.bundle?.api_defs || []
  // 편집 가능한 ESD 번들(generation_tiers.esd). 없으면 null — "ESD 추가"로 새로 만들 수 있다.
  const esdBundle = result.bundle?.esd || null
  const esdEntities = esdBundle?.entities || []
  const esdApis = esdBundle?.apis || []
  // 편집 번들이 없지만 생성된 ESD 스키마(파생, 읽기전용)가 있으면 그걸 seed로 편집 시작할 수 있다.
  // 자연어/문서 생성 ESD를 EsdEditor로 불러와 편집하는 진입점(저장 시 generation_tiers.esd로 PATCH).
  const canSeedEsdFromSchemas = !esdBundle && esdSchemas.length > 0
  const esdEditorInitial = esdBundle || (canSeedEsdFromSchemas ? esdSchemasToBundle(esdSchemas) : null)
  const esdMapping = result.bundle?.esd_mapping || null
  const usage = result.bundle?.usage || null
  const botName = (generatedJson && generatedJson.name) ? generatedJson.name : 'bot'
  // 생성 결과가 시각화 가능한 대화 플로우(dialogs/main)를 갖는지 — 없으면 다이어그램 토글 숨김
  const hasFlow = Array.isArray(generatedJson?.dialogs) && generatedJson.dialogs.some((d) => d?.id === 'main')

  // NLP 학습 데이터 번들 — v0.8.0 이전 결과에는 없다(그때는 섹션을 숨긴다).
  const nlp = result.bundle?.nlp || null
  // 파생 실패 사유 목록 — 어느 것을 보일지·무엇이라 부를지는 순수 모듈이 정한다.
  const derivFailures = derivationErrors(result.bundle)
  const nlpIntentCount = nlp?.intents?.length || 0
  const nlpEntityCount = nlp?.entities?.length || 0
  const nlpUtteranceCount = (nlp?.intents || []).reduce((n, it) => n + (it?.examples?.length || 0), 0)
  // toEntitiesCsv는 truncated 보고를 함께 계산한다 — 렌더에서 여러 번 부르면 같은 순회를 반복하므로 한 번만 계산해 재사용한다.
  const nlpEntitiesResult = nlp ? toEntitiesCsv(nlp) : null

  const nlpBaseName = (botName || 'bot').replace(/[^\w가-힣-]+/g, '_')

  const downloadApiDefs = () => downloadJson(`${botName}_api.json`, apiDefs)
  const copyApiDefs = () => navigator.clipboard?.writeText(JSON.stringify(apiDefs, null, 2))

  // 질문 순서대로 표시 + 매핑 안 되는 키(삭제된 질문)는 뒤에 키 그대로
  const answeredQuestions = questions.filter((q) => responses[q.id] !== undefined)
  const orphanKeys = Object.keys(responses).filter((k) => !questions.some((q) => q.id === k))

  // ① 요약 칩(노드·시나리오·ESD·API·토큰·모델) — 목록 카드와 동일 계산
  const metaChips = resultMetaChips(result)
  // ② 섹션 네비게이션 — 존재하는 섹션만(클릭 시 스무스 스크롤)
  const sections = [
    { id: 'sec-json', label: '생성물' },
    { id: 'sec-edit-chat', label: '대화형 수정' },
    { id: 'sec-survey-edit', label: '설문 기반 수정', show: isSurveyEditable(result) },
    { id: 'sec-usage', label: '사용량', show: !!(usage && usage.total_tokens > 0) },
    { id: 'sec-nlp', label: 'NLP', show: !!nlp },
    { id: 'sec-esd', label: 'ESD', show: esdSchemas.length > 0 },
    { id: 'sec-esd-edit', label: 'ESD·API 편집' },
    { id: 'sec-esd-mapping', label: 'ESD 매핑', show: !!esdMapping },
    { id: 'sec-api', label: 'API', show: apiDefs.length > 0 },
    { id: 'sec-asset-register', label: '라이브러리 등록', show: canArchive && scenarioRootIds(generatedJson).length > 0 },
    { id: 'sec-input', label: '입력 응답' },
  ].filter((s) => s.show !== false)

  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <button onClick={() => navigate('/results')} className="mb-6 px-4 py-2 text-primary-500 hover:underline">← 돌아가기</button>

      {/* ① 요약 헤더 — 봇 이름 + 메타 칩 */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-1">생성된 결과</p>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-3xl font-bold break-words [overflow-wrap:anywhere]">🤖 {resultBotName(result)}</h1>
          <p className="text-sm text-gray-500 whitespace-nowrap pt-2">
            {result.bundle?.created_by ? `👤 ${result.bundle.created_by} · ` : ''}
            {formatKST(result.created_at)}
          </p>
          {canArchive && (
            <Button
              type="button"
              onClick={handleToggleArchive}
              disabled={archiveBusy}
              variant="outlinePrimary"
              size="sm"
            >
              {isArchived(result) ? '보관 해제' : '보관'}
            </Button>
          )}
        </div>
        {verifyStatus !== 'none' && (
          <div className={`mt-3 p-3 rounded-lg border text-sm flex items-start justify-between gap-3 flex-wrap ${verifyStatus === 'verified' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            <div>
              <p className="font-semibold">{verifyStatus === 'verified' ? '✅' : '📝'} {VERIFICATION_LABELS[verifyStatus]}</p>
              <p className="text-xs mt-0.5">
                {verifyStatus === 'verified'
                  ? `솔루션에서 동작을 확인한 결과입니다 (${formatKST(result.bundle.verification.at)}).`
                  : verifyStatus === 'stale'
                    ? '검증 표시 뒤에 흐름이 수정되었습니다. 솔루션에서 다시 확인해 주세요.'
                    : '자동 생성된 초안입니다. 솔루션에 올려 대화로 확인하기 전에는 완성품으로 쓰지 마세요.'}
              </p>
            </div>
            {canVerify && (
              <Button type="button" onClick={handleToggleVerified} disabled={verifyBusy} variant="outlinePrimary" size="sm">
                {verifyStatus === 'verified' ? '검증 표시 해제' : '솔루션 검증 완료로 표시'}
              </Button>
            )}
          </div>
        )}
        {verifyError && (
          <div className="mt-3 p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">{verifyError}</div>
        )}
        {metaChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {metaChips.map((c, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{c}</span>
            ))}
          </div>
        )}
        {archiveError && (
          <div className="mt-3 p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">
            {archiveError}
          </div>
        )}
      </div>

      {/* ② 섹션 네비게이션(sticky) — 글로벌 헤더(h-16=64px, z-50) 바로 아래에 고정 */}
      <div className="sticky top-16 z-40 -mx-6 px-6 py-2 mb-6 bg-white/95 backdrop-blur border-y border-gray-200 flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="text-sm px-3 py-1 rounded-full text-primary-500 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 생성된 JSON */}
      <div id="sec-json" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">생성된 JSON</h2>
            {hasFlow && (
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm">
                  <button
                    onClick={() => { setJsonView('json'); setDiagramEdit(false) }}
                    className={`px-3 py-1.5 ${jsonView === 'json' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    JSON
                  </button>
                  <button
                    onClick={() => setJsonView('diagram')}
                    className={`px-3 py-1.5 border-l border-gray-300 ${jsonView === 'diagram' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    다이어그램
                  </button>
                </div>
                {jsonView === 'diagram' && !diagramEdit && (
                  <Button
                    onClick={() => setDiagramEdit(true)}
                    variant="outlinePrimary"
                    size="sm"
                  >
                    편집
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCopy}
              disabled={!generatedJson}
              variant="outlinePrimary"
            >
              {copied ? '복사됨 ✓' : '복사'}
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!generatedJson}
            >
              다운로드
            </Button>
          </div>
        </div>
        {generatedJson ? (
          hasFlow && jsonView === 'diagram' ? (
            diagramEdit ? (
              <DiagramEditPanel
                result={result}
                name={botName}
                onResultUpdate={setResult}
                onExitEdit={() => setDiagramEdit(false)}
              />
            ) : (
              <div className="bg-white border border-gray-200 rounded overflow-hidden" style={{ height: '32rem' }}>
                <FlowCanvas flowJson={generatedJson} name={botName} readOnly scenarioNames={result?.bundle?.scenarios} />
              </div>
            )
          ) : (
            <pre className="bg-white border border-gray-200 rounded p-4 overflow-auto max-h-[28rem] text-xs leading-relaxed">{JSON.stringify(generatedJson, null, 2)}</pre>
          )
        ) : (
          <div className="bg-white border border-gray-200 rounded p-4 text-gray-500">생성된 JSON 데이터가 없습니다</div>
        )}
      </div>

      {/* 결과 수정 (대화형) — 자연어·다이얼로그 통합. 챗으로 여러 턴 교정, 각 턴 미리보기 후 확정. */}
      {/* 다이어그램 기반 수정은 위 '다이어그램 보기 → 편집 모드'에서 한다. */}
      <div id="sec-edit-chat" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">결과 수정 (대화형)</h2>
        <p className="text-sm text-gray-500 mb-4">챗 대화로 노드·멘트·분기를 교정합니다. 각 발화마다 미리보기를 확인하고 확정하면 저장됩니다. (다이어그램으로 직접 수정하려면 위 다이어그램 보기의 편집 모드를 쓰세요.)</p>
        <ResultDialogEdit result={result} onResultUpdate={setResult} />
      </div>

      {/* 라이브러리 등록 — 시나리오 하나를 자산째로 떼어 올린다(v0.10.0 항목 5).
          보관 표시한 결과에서만 열린다(항목 6의 쓰레기 필터를 그대로 쓴다). */}
      <ScenarioAssetRegister result={result} />

      {/* 파생 실패 사유 — 결과 종류와 무관하게 보인다.
          ⚠ 업로드 전용 블록 안에 두면 안 된다: 사유를 만드는 주체는 생성기이고
             생성 결과는 isUploadedResult가 false라 그 블록이 아예 렌더되지 않는다.
          ⚠ 종류마다 블록을 따로 만들지 마라 — 복제가 세 벌이 된다. */}
      {/* 가려진 갈래 — 분기는 then 순서대로 확인하고 맞은 곳에서 멈추므로 이 갈래들은 실행되지 않는다(v0.16.0).
          결과 종류와 무관하게 보이도록 파생 실패 블록과 같은 자리에 둔다. */}
      {shadowedBranches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-amber-900 mb-1">실행되지 않는 갈래가 있습니다</h3>
          <p className="text-xs text-amber-800 mb-2">분기는 갈래를 위에서부터 확인하고 처음 맞은 갈래로 갑니다. 아래 갈래는 앞 갈래에 가려져 절대 실행되지 않으니 조건을 고쳐 주세요.</p>
          <ul className="list-disc pl-5 space-y-1">
            {shadowedBranches.map((s) => (
              <li key={`${s.dialogId}/${s.nodeId}/${s.reason}/${s.shadowed[0]?.id}`} className="text-sm text-amber-900 break-words">{describeShadowed(s)}</li>
            ))}
          </ul>
        </div>
      )}

      {derivFailures.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-red-800 mb-2">일부 자산을 만들지 못했습니다</h3>
          <ul className="space-y-2">
            {derivFailures.map((f) => (
              <li key={f.key}>
                <p className="text-sm font-medium text-red-800">{f.label}</p>
                <p className="text-sm text-red-700 break-words whitespace-pre-wrap">{f.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 문서 추출 커버리지 — 정의서에서 무엇이 반영되고 무엇이 버려졌는지 보여준다("설명 가능성").
          nlp_error/esd_error/api_error와 같은 패턴: 결과 종류와 무관하게 보이도록 isUploadedResult 블록 앞에 둔다.
          doc_coverage가 없는 결과(설문·자연어)는 이 블록 자체가 렌더되지 않는다. */}
      {result.bundle?.doc_coverage && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">문서 추출 내역</h3>
          <p className="text-xs text-gray-500 mb-3">
            표 {result.bundle.doc_coverage.tables?.length ?? 0}개에서 시나리오{' '}
            {result.bundle.doc_coverage.scenarios?.length ?? 0}개를 만들었습니다.
          </p>
          {(result.bundle.doc_coverage.tables ?? []).length > 0 && (
            <ul className="text-xs text-gray-500 mb-3 space-y-0.5">
              {result.bundle.doc_coverage.tables.map((t) => (
                <li key={t.name}>
                  {t.title ? `${t.name} — ${t.title}` : t.name} ({t.rowCount}행)
                </li>
              ))}
            </ul>
          )}
          {/* 만들어진 시나리오 이름 — "이 행이 이 시나리오가 됐다"의 앞쪽 절반.
              개수만 보여주면 "무엇이 반영됐나"를 말하지 못한다(이름 데이터는 이미 번들에 있다). */}
          {(result.bundle.doc_coverage.scenarios ?? []).length > 0 && (
            <ul className="text-xs text-gray-600 mb-3 flex flex-wrap gap-1.5">
              {result.bundle.doc_coverage.scenarios.map((s, i) => (
                <li key={`${s.name}-${i}`} className="bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
                  {s.name || '(이름 없음)'}
                </li>
              ))}
            </ul>
          )}
          {(result.bundle.doc_coverage.columnMapping ?? []).length > 0 && (
            <ul className="text-sm mb-3 divide-y divide-gray-100 border border-gray-100 rounded">
              {result.bundle.doc_coverage.columnMapping.map((m) => (
                <li key={m.column} className="px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-gray-700">{m.column}</span>
                  {m.mappedTo ? (
                    <span className="text-gray-900">→ {m.mappedTo}</span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-0.5">
                      반영 안 됨
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(result.bundle.doc_coverage.notes ?? []).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
              {result.bundle.doc_coverage.notes.map((n, i) => (
                <p key={i} className="text-sm text-amber-800">{n}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 업로드 봇 자산 역파생 — NLP 학습 데이터·ESD 스키마를 flow에서 사후 파생한다.
          generated_json은 건드리지 않고 generation_tiers에만 붙는다(왕복 무손실 불변식).
          조립물은 `!isAssembledResult(result)`를 덧붙이지 않는다 — 두 판정은 구성상 배타적이다:
          isUploadedResult는 generation_tiers.upload를 요구하는데 buildBundle('assembled', …)는
          그 키를 절대 쓰지 않는다. 조립물 차단은 서버측 가드(derive-assets 409)가 담당한다. */}
      {isUploadedResult(result) && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">이 챗봇에서 자산 뽑아내기</h3>
          <p className="text-xs text-gray-500 mb-3">
            올린 챗봇의 시나리오를 읽어 NLP 학습 데이터와 ESD 스키마를 만듭니다.
            챗봇 JSON 자체는 바뀌지 않습니다.
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <Button size="sm" disabled={deriving !== ''} onClick={() => runDerive('nlp')}>
              {deriving === 'nlp' ? '만드는 중…' : 'NLP 학습 데이터 만들기'}
            </Button>
            <Button variant="outlinePrimary" size="sm" disabled={deriving !== ''} onClick={() => runDerive('esd')}>
              {deriving === 'esd' ? '뽑는 중…' : 'ESD 스키마 뽑기'}
            </Button>
            {deriveMsg && <span className="text-xs text-gray-600">{deriveMsg}</span>}
          </div>
        </div>
      )}

      {/* 업로드한 기존 챗봇 안내 — 잠긴 노드가 있으면 무엇이 되고 안 되는지 먼저 알린다. */}
      {isUploadedResult(result) && (result.bundle?.upload?.locked_count > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 mb-4">
          <p>
            <b>{result.bundle.upload.locked_count}개 노드는 내용 편집을 지원하지 않습니다.</b>
          </p>
          <p className="mt-1">
            다이어그램에는 그대로 보이고 <b>연결 바꾸기·삭제는 가능</b>합니다. 내용만 잠깁니다.
            저장·다운로드 시 이 노드들의 설정은 <b>원본 그대로 보존</b>됩니다.
          </p>
        </div>
      )}

      {/* 결과 수정 (설문 기반) — 설문 생성 결과에만 노출(isSurveyEditable). 업로드 봇·NL·문서 생성은 숨김. */}
      {isSurveyEditable(result) && (
        <div id="sec-survey-edit" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">결과 수정 (설문 기반)</h2>
          <p className="text-sm text-gray-500 mb-4">설문 응답을 수정해 결과를 재생성합니다. 미리보기 확인 후 확정하면 저장됩니다.</p>
          <ResultSurveyEdit result={result} questions={questions} onResultUpdate={setResult} />
        </div>
      )}

      {/* LLM 사용량 (있을 때만) */}
      {usage && usage.total_tokens > 0 && (
        <div id="sec-usage" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">LLM 사용량</h2>
          <p className="text-sm text-gray-500 mb-4">이 결과를 생성하는 데 사용한 토큰입니다. {usage.model ? `(${usage.model})` : ''}</p>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>· 호출 {Number(usage.calls || 0).toLocaleString()}회</li>
            <li>· 입력 {Number(usage.prompt_tokens || 0).toLocaleString()} / 출력 {Number(usage.completion_tokens || 0).toLocaleString()} 토큰</li>
            <li className="font-medium text-gray-900">
              · 총 {Number(usage.total_tokens).toLocaleString()} 토큰
              {typeof usage.estimated_cost_usd === 'number'
                ? ` (≈ $${usage.estimated_cost_usd.toFixed(2)})`
                : usage.estimated_cost_usd === null
                  ? ' (비용 미상)'
                  : ''}
            </li>
            {/* 생성 소요 시간 — 측정 이전에 만든 결과엔 duration_ms가 없다. 그때는 줄 자체를 숨긴다
                (0초로 보여주면 측정한 적 없는 것을 측정한 것처럼 만든다). */}
            {formatDuration(usage.duration_ms) && (
              <li title="생성 요청을 받아 결과를 저장하기까지의 서버 처리 시간(네트워크 왕복 제외)">
                · 생성 시간 {formatDuration(usage.duration_ms)}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* NLP 학습 데이터 (v0.8.0부터 — 이전 결과에는 번들이 없어 섹션을 숨긴다) */}
      {nlp && (
        <div id="sec-nlp" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">NLP 학습 데이터</h2>
          <p className="text-sm text-gray-500 mb-4">
            인텐트 {nlpIntentCount}종 · 어터런스 {nlpUtteranceCount}개 · 엔티티 {nlpEntityCount}종.
            아래 CSV를 DialogFlow NLP에 업로드하세요.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => downloadCsv(`${nlpBaseName}_intents.csv`, toIntentsCsv(nlp))}
              size="sm"
            >
              intents.csv 다운로드
            </Button>
            <Button
              onClick={() => downloadCsv(`${nlpBaseName}_entities.csv`, nlpEntitiesResult.csv)}
              variant="outlinePrimary"
              size="sm"
            >
              entities.csv 다운로드
            </Button>
          </div>
          {nlpEntitiesResult.truncated.length > 0 && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              동의어가 CSV 컬럼 수(13)를 넘어 일부 잘렸습니다:{' '}
              {nlpEntitiesResult.truncated.map((t) => `${t.entity}/${t.value} ${t.dropped}개`).join(', ')}
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            메뉴처럼 솔루션에 등록된 항목을 가리키는 엔티티는 생성되지 않습니다 — 솔루션에서 직접 추가하세요.
          </p>
        </div>
      )}

      {/* ESD 스키마 (있을 때만) */}
      {esdSchemas.length > 0 && (
        <div id="sec-esd" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">ESD 스키마</h2>
          <p className="text-sm text-gray-500 mb-4">아래 스키마를 DialogFlow ESD에 import한 뒤 봇을 사용하세요. (🔑 키, 🔒 암호화)</p>
          {canSeedEsdFromSchemas && (
            <p className="mb-4 rounded-md border border-[#93C5FD] bg-[#EFF6FF] px-3 py-2 text-xs text-[#1E40AF]">
              이 스키마를 수정하려면 아래 <span className="font-semibold">'ESD·API (편집 가능)'</span>에서 <span className="font-semibold">'생성된 ESD 편집'</span>을 누르세요.
            </p>
          )}
          {esdSchemas.map((s, i) => <EsdSchemaCard key={i} schema={s} />)}
        </div>
      )}

      {/* ESD (편집 가능) — generation_tiers.esd 번들. 편집 시 결과에 저장(PATCH). 없으면 추가 가능. */}
      <div id="sec-esd-edit" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-lg font-semibold">ESD·API (편집 가능)</h2>
          <Button onClick={() => setEsdModalOpen(true)}>
            {esdBundle ? 'ESD·API 편집' : canSeedEsdFromSchemas ? '생성된 ESD 편집' : 'ESD·API 추가'}
          </Button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {canSeedEsdFromSchemas
            ? '위에서 생성된 ESD 스키마를 불러와 편집합니다. 편집하면 이 결과에 저장됩니다. (🔑 키, 🔒 암호화)'
            : '이 결과에 번들된 ESD·API입니다. 편집하면 이 결과에 저장됩니다. (🔑 키, 🔒 암호화)'}
        </p>
        {esdBundle && (esdEntities.length > 0 || esdApis.length > 0) ? (
          <div className="space-y-2">
            {esdEntities.map((e, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-md p-3">
                <p className="font-semibold text-gray-900">
                  {e.name || '(이름 없음)'}{' '}
                  <span className="text-xs text-gray-500 font-normal">({e.fields?.length || 0}개 필드)</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(e.fields || []).map((f, j) => (
                    <span key={j} className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                      {f.name}:{f.type}{f.key ? ' 🔑' : ''}{f.crypt === 'true' ? ' 🔒' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {esdApis.length > 0 && (
              <p className="text-sm text-gray-600">API 정의 {esdApis.length}개</p>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded p-4 text-gray-500">
            {canSeedEsdFromSchemas
              ? `생성된 ESD 스키마 ${esdSchemas.length}개를 편집할 수 있습니다. "생성된 ESD 편집"을 누르세요.`
              : '번들된 ESD가 없습니다. "ESD 추가"로 만들 수 있습니다.'}
          </div>
        )}
      </div>

      {esdModalOpen && (
        <EsdEditor
          initialEsdJson={esdEditorInitial}
          title={esdBundle ? '결과 ESD·API 편집' : canSeedEsdFromSchemas ? '생성된 ESD 편집' : '결과 ESD·API 추가'}
          onSave={async (esd_json) => {
            const updated = await updateResultEsd(result.id, esd_json)
            setResult(updated)
          }}
          onClose={() => setEsdModalOpen(false)}
        />
      )}

      {/* ESD 매핑 (있을 때만 — esd_mapping이 기록된 결과) */}
      {esdMapping && (
        <div id="sec-esd-mapping" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">ESD 매핑</h2>
          <p className="text-sm text-gray-500 mb-4">생성 시 제안된 ESD 필드 ↔ 수집변수 매핑 결과입니다. (읽기 전용)</p>
          <EsdMappingView mapping={esdMapping} />
        </div>
      )}

      {/* API 정의 (있을 때만) */}
      {apiDefs.length > 0 && (
        <div id="sec-api" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-semibold">API 정의</h2>
            <div className="flex gap-2">
              <Button onClick={copyApiDefs} variant="outlinePrimary">복사</Button>
              <Button onClick={downloadApiDefs}>다운로드</Button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">아래 API 정의를 DialogFlow에 import한 뒤 봇을 사용하세요. ({apiDefs.length}개)</p>
          <ul className="mb-3 space-y-1">
            {apiDefs.map((a, i) => (
              <li key={i} className="text-sm text-gray-700">
                <span className="font-mono text-xs uppercase text-gray-500">{a.method || '-'}</span> · <span className="font-medium">{a.name}</span>
                {a.description ? ` — ${a.description}` : ''}
              </li>
            ))}
          </ul>
          <pre className="bg-white border border-gray-200 rounded p-4 overflow-auto max-h-[24rem] text-xs leading-relaxed">{JSON.stringify(apiDefs, null, 2)}</pre>
        </div>
      )}

      {/* 입력한 응답 */}
      <div id="sec-input" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">입력한 응답</h2>
          {/* ⚠ 버튼만 감춘다 — 섹션과 sec-input 칩은 그대로 둔다.
              nl·doc 생성 결과는 isSurveyEditable이 false지만 볼 만한 응답을 갖고 있어서,
              칩까지 감추면 그 결과의 응답 보기 경로가 사라진다.
              감추는 이유: 조립물·업로드 봇은 responses가 {}라 이 버튼이 빈 설문으로 보낸다
              (isSurveyEditable이 막는 것과 같은 실패 모양 — 보이면 눌러서 실패한다). */}
          {isSurveyEditable(result) && (
            <Button
              onClick={handleRegenerate}
            >
              이 답변으로 다시 생성
            </Button>
          )}
        </div>

        {answeredQuestions.length === 0 && orphanKeys.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded p-4 text-gray-500">입력 데이터가 없습니다</div>
        ) : (
          <div className="space-y-4">
            {answeredQuestions.map((q) => {
              const value = responses[q.id]
              // 시나리오(TEMPLATED 배열)는 전용 카드로 — 그 외 응답은 기존 렌더 유지.
              const isScenarioList = q.input_type === INPUT_TYPES.TEMPLATED && Array.isArray(value)
              return (
                <div key={q.id} className="bg-white border border-gray-200 rounded-md p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-2">{q.text}</p>
                  {isScenarioList ? <ScenarioAnswer scenarios={value} /> : <AnswerValue value={value} />}
                </div>
              )
            })}
            {orphanKeys.map((k) => (
              <div key={k} className="bg-white border border-gray-200 rounded-md p-4">
                <p className="text-sm font-semibold text-gray-500 mb-2">{k} <span className="text-xs">(삭제된 질문)</span></p>
                <AnswerValue value={responses[k]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

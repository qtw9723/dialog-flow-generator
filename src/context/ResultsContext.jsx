import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { supabase } from '../lib/supabase'
import { API_ENDPOINTS } from '../lib/constants'
import { injectEsd, injectConfirmedMapping } from '../lib/generatorBody'
import { summarizeResponseChanges } from '../lib/edit/surveyEditSummary'
import { normalizeResult, normalizeResults } from '../lib/resultBundle/normalizeResult.js'

const ResultsContext = createContext()

// 조회 대상 결정: 로그인한 테스터는 본인 것(results), master 관리자는 전체(admin-results).
async function pickEndpoints() {
  const { data: { session } } = await supabase.auth.getSession()
  const isMaster = !session && !!localStorage.getItem('adminToken')
  return isMaster
    ? { list: API_ENDPOINTS.ADMIN_RESULTS, detail: API_ENDPOINTS.ADMIN_RESULT_DETAIL, del: API_ENDPOINTS.ADMIN_RESULTS }
    : { list: API_ENDPOINTS.RESULTS, detail: API_ENDPOINTS.RESULT_DETAIL, del: API_ENDPOINTS.RESULTS }
}

export function ResultsProvider({ children }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { request } = useApi()
  const hasLoadedRef = useRef(false)

  // 목록 로드는 여기 한 곳뿐이다 — 초기 로드와 refetch가 같은 코드를 두 벌 갖고 있었다.
  // 프로바이더는 앱 생애에 한 번만 자동 로드하므로(hasLoadedRef), 신선도가 필요한 화면은
  // 마운트 시 refetch()를 명시로 부른다(예: results/ResultsList).
  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ep = await pickEndpoints()
      const data = await request(ep.list)
      setResults(normalizeResults(data))
      setError(null)
    } catch (err) {
      console.error('[ResultsContext] Failed to fetch results:', err)
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true
    refetch()
  }, [refetch])

  const getResultById = useCallback(async (id) => {
    const ep = await pickEndpoints()
    return normalizeResult(await request(ep.detail(id)))
  }, [request])

  // created_by는 서버가 JWT에서 결정하므로 전송값은 무시되지만, 하위호환 위해 인자 유지.
  // source('survey'|'nl'|'doc'): 생성 경로 마커. 결과 수정 화면의 설문 편집 게이팅용. 없으면 미전송(하위호환).
  // docCoverage: 문서 추출 커버리지(poc-doc 전용, 선택). 없으면 미전송(하위호환) — 설문·자연어 호출부는 인자를 안 넘긴다.
  const createResult = useCallback(async (responses, referenceId, createdBy, esd, confirmedMapping, source, docCoverage) => {
    const base = { responses, reference_id: referenceId, created_by: createdBy || '' }
    if (source) base.source = source
    if (docCoverage) base.doc_coverage = docCoverage
    const data = normalizeResult(await request(API_ENDPOINTS.DIALOGFLOW_GENERATOR, {
      method: 'POST',
      body: injectConfirmedMapping(injectEsd(base, esd), confirmedMapping),
      loadingMessage: '생성 중… 잠시만 기다려 주세요',
    }))
    setResults((prev) => [data, ...prev])
    return data
  }, [request])

  // 결과에 번들된 ESD(generation_tiers.esd)만 갱신. pickEndpoints()로 results/admin-results를 가른다.
  // esd=null이면 번들 제거. 목록의 해당 결과도 서버 반환본으로 교체.
  const updateResultEsd = useCallback(async (id, esd) => {
    const ep = await pickEndpoints()
    const data = normalizeResult(await request(ep.detail(id), {
      method: 'PATCH',
      body: { esd },
      loadingMessage: 'ESD 저장 중…',
    }))
    setResults((prev) => prev.map((r) => (r.id === id ? data : r)))
    return data
  }, [request])

  // 보관 표시만 갱신(generation_tiers.archived). results 함수 PATCH(본인 결과·user JWT).
  // 낙관적 갱신을 쓰지 않는다 — 서버 반환본으로 교체해 실패 시 화면이 어긋나지 않게 한다.
  // 엔드포인트는 pickEndpoints()로 가른다 — master 관리자는 admin-results(6a가 archived 분기 추가).
  const setResultArchived = useCallback(async (id, archived) => {
    const ep = await pickEndpoints()
    const data = normalizeResult(await request(ep.detail(id), {
      method: 'PATCH',
      body: { archived },
    }))
    setResults((prev) => prev.map((r) => (r.id === id ? data : r)))
    return data
  }, [request])

  // '솔루션 검증 완료' 표시 토글(generation_tiers.verification, v0.16.0). 보관 표시와 같은 경로·같은 원칙.
  const setResultVerified = useCallback(async (id, verified) => {
    const ep = await pickEndpoints()
    const data = normalizeResult(await request(ep.detail(id), {
      method: 'PATCH',
      body: { verified },
    }))
    setResults((prev) => prev.map((r) => (r.id === id ? data : r)))
    return data
  }, [request])

  const editResult = useCallback(async (id, instruction) => {
    const result = results.find((r) => r.id === id)
    const flow = result?.generated_json
    const esd = result?.bundle?.esd
    const body = { flow, instruction }
    if (esd) body.esd = esd
    return await request(API_ENDPOINTS.RESULT_EDIT_PARSE, {
      method: 'POST',
      body,
    })
  }, [results, request])

  // bundlePatch를 넘기면 NLP·ESD·API 파생 사유를 함께 옮긴다(설문 재생성 확정 경로).
  // 넘기지 않으면 지금까지와 똑같이 동작한다 — 다이어그램 편집 등 다른 호출부는 무변경이다.
  // ⚠ esd_error·api_error를 안 실으면(v0.11.0 이전) 옛 사유가 화면에 영구히 박힌다 — 재생성이
  // 깨끗해도 지울 사용자 동작이 없었다. nlp_error와 같은 모양으로 함께 태운다.
  const applyResultEdit = useCallback(async (id, newFlow, entry, bundlePatch) => {
    const ep = await pickEndpoints()
    const body = { generated_json: newFlow, edit_entry: entry }
    if (bundlePatch) {
      body.nlp = bundlePatch.nlp ?? null
      if (bundlePatch.nlpError) body.nlp_error = bundlePatch.nlpError
      if (bundlePatch.esdError) body.esd_error = bundlePatch.esdError
      if (bundlePatch.apiError) body.api_error = bundlePatch.apiError
    }
    const data = normalizeResult(await request(ep.detail(id), {
      method: 'PATCH',
      body,
    }))
    setResults((prev) => prev.map((r) => (r.id === id ? data : r)))
    return data
  }, [request])

  const undoResultEdit = useCallback(async (id) => {
    const ep = await pickEndpoints()
    const data = normalizeResult(await request(ep.detail(id), {
      method: 'PATCH',
      body: { undo: true },
    }))
    setResults((prev) => prev.map((r) => (r.id === id ? data : r)))
    return data
  }, [request])

  const regenerateFromResponses = useCallback(async (id, editedResponses, questions) => {
    const result = results.find((r) => r.id === id)
    if (!result) throw new Error('결과를 찾을 수 없습니다')

    const referenceId = result.reference_id
    const esd = result.bundle?.esd
    const confirmedMapping = result.bundle?.confirmed_mapping

    const body = injectConfirmedMapping(
      injectEsd({ responses: editedResponses, reference_id: referenceId }, esd),
      confirmedMapping,
    )
    const data = normalizeResult(await request(API_ENDPOINTS.DIALOGFLOW_GENERATOR, {
      method: 'POST',
      body,
    }))

    const generatedId = data.id
    const newFlow = data.generated_json
    const validation = data.bundle?.validation ?? null
    // 플로우만 옮기고 NLP를 두고 오면, 편집 전 응답으로 만든 옛 인텐트가 새 플로우에 남는다.
    // 그 상태로 내려받은 intents.csv는 현재 시나리오와 맞지 않는다(조용히 틀린 데이터).
    const nlp = data.bundle?.nlp ?? null
    // 생성기가 nlp도 nlp_error도 못 내면(산출물 없음) 사유 없이 조용히 삭제되는 것을 막는다.
    const nlpError = data.bundle?.nlp_error ?? (data.bundle?.nlp ? null : '새 설문으로 NLP 학습 데이터를 만들지 못했습니다(산출물 없음).')
    // ESD·API는 시나리오에 따라 아예 없을 수 있어(선택 기능) nlp와 달리 부재를 오류로 보지 않는다 —
    // 새 결과에 없으면 그냥 null(확정 시 옛 사유를 지운다).
    const esdError = data.bundle?.esd_error ?? null
    const apiError = data.bundle?.api_error ?? null

    // 임시 생성행 삭제(orphan 방지) — 원본 미변경, state에 추가하지 않음
    let orphanCleanupFailed = false
    try {
      const ep = await pickEndpoints()
      await request(`${ep.del}?id=${generatedId}`, { method: 'DELETE' })
    } catch (e) {
      console.warn('[regenerateFromResponses] 임시 결과 삭제 실패:', e)
      orphanCleanupFailed = true
    }
    setResults((prev) => prev.filter((r) => r.id !== generatedId))

    const instruction = summarizeResponseChanges(
      Array.isArray(questions) ? questions : [],
      result.responses || {},
      editedResponses || {},
    )

    return { newFlow, validation, instruction, generatedId, orphanCleanupFailed, nlp, nlpError, esdError, apiError }
  }, [results, request])

  const deleteResult = useCallback(async (id) => {
    const ep = await pickEndpoints()
    await request(`${ep.del}?id=${id}`, {
      method: 'DELETE'
    })
    setResults((prev) => prev.filter((r) => r.id !== id))
  }, [request])

  return (
    <ResultsContext.Provider value={{ results, loading, error, getResultById, createResult, updateResultEsd, setResultArchived, setResultVerified, deleteResult, refetch, editResult, applyResultEdit, undoResultEdit, regenerateFromResponses }}>
      {children}
    </ResultsContext.Provider>
  )
}

export function useResults() {
  const context = useContext(ResultsContext)
  if (!context) {
    throw new Error('useResults must be used within ResultsProvider')
  }
  return context
}

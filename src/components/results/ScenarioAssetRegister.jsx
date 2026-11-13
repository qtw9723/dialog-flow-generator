import { useMemo, useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { API_ENDPOINTS, SCENARIO_CATEGORIES } from '../../lib/constants'
import { flowToScenarios } from '../../lib/flow/flowToScenarios.js'
import { scenarioAssetsAt, assetCounts } from '../../lib/assets/scenarioAssets.js'
import { extractScenarioMiniBot } from '../../lib/assets/scenarioMiniBot.js'
import { isArchived } from '../../lib/resultBundle/archiveFilter.js'
import { assetErrorMessage } from '../../lib/assets/library.js'

// 결과 상세: 시나리오 하나를 자산째로 라이브러리에 등록한다(v0.10.0 항목 5).
// 등록 대상은 **보관 표시한 결과**로 제한한다 — 항목 6의 보관 표시가 1차 쓰레기 필터다.
export default function ScenarioAssetRegister({ result }) {
  const { request } = useApi()
  const { user, isAdmin } = useAuth()
  const [category, setCategory] = useState(SCENARIO_CATEGORIES[0])
  const [busy, setBusy] = useState(-1)          // 등록 중인 시나리오 인덱스
  const [done, setDone] = useState({})          // index → 등록된 자산 이름
  const [error, setError] = useState('')

  const flow = result?.generated_json
  const scenarios = useMemo(
    () => flowToScenarios(flow, { scenarioNames: result?.bundle?.scenarios }),
    [flow, result?.bundle?.scenarios],
  )
  const archived = isArchived(result)

  // 관리자도 등록한다(2026-10-26 사용자 결정). master는 세션이 없어 등록자(owner_email)가 비어 저장된다 —
  // 그래서 관리자가 등록한 자산은 라이브러리에서 삭제 버튼이 나오지 않는다(서버 삭제는 등록자 본인만).
  if (!user && !isAdmin) return null
  if (scenarios.length === 0) return null

  const register = async (index) => {
    setBusy(index); setError('')
    try {
      const miniBot = extractScenarioMiniBot(flow, index)
      if (!miniBot) throw new Error('이 시나리오를 미니봇으로 뽑지 못했습니다.')
      const assets = scenarioAssetsAt(flow, result?.bundle, index)
      const row = await request(API_ENDPOINTS.SCENARIO_ASSETS, {
        method: 'POST',
        body: {
          category,
          name: scenarios[index].name,
          description: scenarios[index].trigger || '',
          flow_json: miniBot,
          assets,
          source_result_id: result.id,
        },
      })
      setDone((p) => ({ ...p, [index]: row?.name || scenarios[index].name }))
    } catch (e) {
      setError(assetErrorMessage(e))
    } finally {
      setBusy(-1)
    }
  }

  return (
    <div id="sec-asset-register" className="scroll-mt-32 bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
      <h2 className="text-lg font-semibold mb-1">라이브러리에 등록</h2>
      <p className="text-sm text-gray-500 mb-4">
        시나리오 하나를 자산(ESD·NLP·API)째로 떼어 라이브러리에 올립니다. 올린 자산은 팀 전체가 골라 조립할 수 있습니다.
      </p>

      {!archived && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          보관 표시한 결과에서만 등록할 수 있습니다. 위의 <b>보관</b> 버튼을 먼저 눌러주세요.
        </div>
      )}
      {error && <p className="mb-3 text-sm text-[#EF4444]">{error}</p>}

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
        카테고리
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {SCENARIO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <ul className="space-y-2">
        {scenarios.map((s, i) => {
          const c = assetCounts(scenarioAssetsAt(flow, result?.bundle, i))
          return (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[#1F2937]">{s.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  ESD {c.esd} · 인텐트 {c.intents} · 엔티티 {c.entities} · API {c.api}
                </p>
              </div>
              {done[i] ? (
                <span className="shrink-0 text-sm text-[#047857]">등록됨 ✓</span>
              ) : (
                <button
                  type="button"
                  disabled={!archived || busy !== -1}
                  onClick={() => register(i)}
                  className="shrink-0 rounded-md border border-primary-500 px-3 py-1.5 text-sm text-primary-500 bg-white hover:bg-blue-50 disabled:opacity-50"
                  title={archived ? '' : '보관 표시한 결과에서만 등록할 수 있습니다.'}
                >
                  {busy === i ? '등록 중…' : '라이브러리에 등록'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

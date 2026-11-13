import { useEffect, useMemo, useState, useCallback } from 'react'
import { downloadJson as download } from '../../lib/downloadFile.js'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../context/AuthContext'
import { API_ENDPOINTS, SCENARIO_CATEGORIES } from '../../lib/constants'
import { ASSET_BADGES, ASSET_BADGE_STYLES, mergeLibraryItems, assetErrorMessage } from '../../lib/assets/library.js'
import { assetCounts } from '../../lib/assets/scenarioAssets.js'
import FlowCanvas from '../flow/FlowCanvas'

// 사용자: 카테고리별 시나리오(기반 레퍼런스 + 팀이 등록한 자산)를 탐색하고,
// 하나를 받아 쓰거나 여러 개를 골라 하나의 봇으로 조립해 결과로 저장한다.
export default function ScenarioLibrary() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initialCat = params.get('category')
  const [category, setCategory] = useState(SCENARIO_CATEGORIES.includes(initialCat) ? initialCat : '금융')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 팀 자산(scenario-assets) 조회만 실패한 경우의 **비차단** 안내. error(치명)와 별개로 둔다 —
  // 기반 자료(references)는 이 브랜치 전부터 잘 뜨던 화면이라, 자산 함수가 미배포여도
  // 화면 전체가 비어서는 안 된다.
  const [assetsNotice, setAssetsNotice] = useState('')
  const [selected, setSelected] = useState({})
  const [warnings, setWarnings] = useState([])
  const [previewItem, setPreviewItem] = useState(null)
  const [botName, setBotName] = useState('')
  const [assembling, setAssembling] = useState(false)
  const { request } = useApi()
  const { user } = useAuth()

  useEffect(() => {
    if (!previewItem) return
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) setPreviewItem(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewItem])

  const load = useCallback(async (cat) => {
    setLoading(true); setError(''); setAssetsNotice(''); setWarnings([])
    const q = `?category=${encodeURIComponent(cat)}`
    // 두 테이블을 나눠 둔 이유: dialogflow_scenario_references는 few-shot 주입 소스라
    // 검증 안 된 사용자 자산을 섞으면 모든 생성에 자동 주입된다. 화면에서만 합친다.
    //
    // ⚠ Promise.all이 아니라 allSettled다 — 한쪽 실패로 다른 쪽까지 버리지 않는다.
    // scenario-assets가 미배포인 환경(dev 슬러그 목록 누락 등)에서 Promise.all이면
    // 기반 자료까지 사라져 화면이 통째로 비었다. 성공한 쪽은 그린다.
    const [refs, assets] = await Promise.allSettled([
      request(`${API_ENDPOINTS.SCENARIO_REFERENCES}${q}`),
      request(`${API_ENDPOINTS.SCENARIO_ASSETS}${q}`),
    ])
    // 기반 자료 실패는 목록 자체를 못 만든다 — 치명 오류로 남긴다.
    if (refs.status === 'rejected') {
      setItems([])
      setError(assetErrorMessage(refs.reason))
      setLoading(false)
      return
    }
    if (assets.status === 'rejected') {
      // 문구는 전부 assetErrorMessage를 거친다(한국어 문구 규칙) — 원문 뒤에 맥락만 덧붙인다.
      setAssetsNotice(`팀이 등록한 자산을 불러오지 못했습니다. 기반 자료만 표시합니다. (${assetErrorMessage(assets.reason)})`)
    }
    setItems(mergeLibraryItems(refs.value, assets.status === 'fulfilled' ? assets.value : [], user?.email))
    setLoading(false)
  }, [request, user?.email])

  useEffect(() => { load(category) }, [category, load])

  const pickCategory = (c) => { setCategory(c); setSelected({}); setParams({ category: c }) }
  const toggle = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }))
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected])
  // 체크한 순서가 아니라 목록 순서로 보낸다 — 첫 봇이 조립의 base(보일러플레이트 제공자)다.
  const selectedItems = useMemo(
    () => items.filter((it) => selected[it.id]),
    [items, selected],
  )

  const assemble = async () => {
    setError(''); setWarnings([]); setAssembling(true)
    try {
      const res = await request(`${API_ENDPOINTS.SCENARIO_REFERENCES}?action=assemble`, {
        method: 'POST',
        loadingMessage: '조립하는 중…',
        body: {
          items: selectedItems.map((it) => ({ kind: it.kind, id: it.id })),
          save: true,
          name: botName.trim() || `${category} 조립봇`,
        },
      })
      setWarnings(res?.warnings || [])
      // 결과 행으로 저장했으므로 상세로 보낸다 — 봇 JSON·ESD·NLP CSV 다운로드가 거기 다 있다.
      if (res?.result?.id) navigate(`/results/${res.result.id}`)
      else setError('조립물을 저장하지 못했습니다.')
    } catch (e) {
      // ⚠ 조립 결과가 빈 flow면 엔드포인트가 400 { flow_json: null, warnings: [...] }을 준다.
      // useApi의 request()는 message/error 필드가 없는 오류 바디를 'API request failed'로
      // 뭉뚱그려 던지고 원본 warnings는 버린다(useApi는 앱 공용이라 여기서 못 고친다).
      // assetErrorMessage도 이제 'API request failed'를 한국어로 바꾸지만(라이브러리 조회 실패 등
      // 다른 경로를 위한 범용 문구), 조립 컨텍스트에서는 "봇을 못 만들었다"는 더 정확한 안내가
      // 가능하므로 여기서 먼저 가로챈다 — 범용 매핑보다 우선한다.
      setError(e?.message === 'API request failed'
        ? '선택한 시나리오로는 조립 가능한 봇을 만들지 못했습니다. 다른 조합을 선택해 주세요.'
        : assetErrorMessage(e))
    } finally { setAssembling(false) }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1F2937]">시나리오 라이브러리</h1>
      </div>
      <p className="mb-6 text-sm text-[#6B7280]">기반 자료와 팀이 등록한 자산을 그대로 받아 쓰거나, 여러 개를 골라 하나의 봇으로 합쳐 결과로 저장할 수 있어요.</p>

      {/* 카테고리 탭 */}
      <div className="mb-5 flex flex-wrap gap-2">
        {SCENARIO_CATEGORIES.map((c) => (
          <button key={c} onClick={() => pickCategory(c)} className={`rounded-full px-4 py-1.5 text-sm transition-colors ${category === c ? 'bg-primary-500 text-white' : 'bg-white border border-[#E5E7EB] text-[#6B7280] hover:text-[#1F2937]'}`}>{c}</button>
        ))}
      </div>

      {/* 다중 선택 액션 */}
      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-[#EFF6FF] px-4 py-3">
          <span className="text-sm text-[#1F2937]">{selectedIds.length}개 선택됨</span>
          <input
            type="text"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder={`${category} 조립봇`}
            className="min-w-0 flex-1 rounded-md border border-[#BFDBFE] bg-white px-3 py-1.5 text-sm"
          />
          <button
            onClick={assemble}
            disabled={assembling}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {assembling ? '조립 중…' : '선택한 시나리오로 봇 만들기'}
          </button>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          <p className="mb-1 font-medium">조립 경고</p>
          <ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {error && <p className="mb-4 text-sm text-[#EF4444]">{error}</p>}
      {assetsNotice && (
        <div className="mb-4 rounded-lg border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          {assetsNotice}
        </div>
      )}

      {/* 목록 */}
      {loading ? <p className="py-12 text-center text-sm text-[#6B7280]">불러오는 중…</p>
        : items.length === 0 ? <p className="py-12 text-center text-sm text-[#6B7280]">이 카테고리엔 아직 시나리오가 없어요.</p>
        : (
          <ul className="space-y-3">
            {items.map((it) => {
              const c = it.assets ? assetCounts(it.assets) : null
              return (
                <li key={it.id} className="flex items-start gap-3 rounded-lg border border-[#E5E7EB] bg-white p-4">
                  <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggle(it.id)} className="mt-1 h-4 w-4 cursor-pointer accent-primary-500" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium text-[#1F2937]">
                      <span className="truncate">{it.name}</span>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${ASSET_BADGE_STYLES[it.badge]}`}>
                        {ASSET_BADGES[it.badge]}
                      </span>
                    </p>
                    {it.description && <p className="mt-0.5 text-sm text-[#6B7280]">{it.description}</p>}
                    {c && (
                      <p className="mt-0.5 text-xs text-[#6B7280]">
                        ESD {c.esd} · 인텐트 {c.intents} · 엔티티 {c.entities} · API {c.api}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setPreviewItem(it)} className="rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm text-primary-500 hover:bg-[#F8FAFC]">미리보기</button>
                  <button onClick={() => download(`${it.name}.json`, it.flow_json)} className="rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm text-primary-500 hover:bg-[#F8FAFC]">다운로드</button>
                </li>
              )
            })}
          </ul>
        )}

      {/* 전체화면 FlowCanvas 뷰어 */}
      {previewItem && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}
          onClick={() => setPreviewItem(null)}
        >
          <div
            style={{
              padding: '10px 16px', borderBottom: '1px solid #E5E7EB', background: '#fff',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {previewItem.name}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ASSET_BADGES[previewItem.badge]}{previewItem.description ? ` — ${previewItem.description}` : ''}
              </p>
            </div>
            <button
              onClick={() => setPreviewItem(null)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '5px 10px', fontSize: 12, color: '#374151', background: '#fff',
                border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              }}
            >
              닫기
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
            <FlowCanvas flowJson={previewItem.flow_json} name={previewItem.name} readOnly />
          </div>
        </div>
      )}
    </div>
  )
}

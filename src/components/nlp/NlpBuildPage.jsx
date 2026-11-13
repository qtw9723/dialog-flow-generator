import { useState, useEffect } from 'react'
import { API_ENDPOINTS } from '../../lib/constants'
import { useApi } from '../../hooks/useApi'
import { toIntentsCsv, toEntitiesCsv } from '../../lib/nlp/toNlpCsv'
import { downloadCsv } from '../../lib/downloadFile'
import { Button } from '../common/Button'
import StepBar from '../ui/StepBar'
import PageHeader from '../ui/PageHeader'

// 새로고침 보호용 임시 저장. 저장소가 아니라 편의 기능이며 탭을 닫으면 사라진다.
// 영구 저장은 v0.10.0 항목 5(자산 라이브러리)가 맡는다.
const DRAFT_KEY = 'nlpBuildDraft'

const STEPS = ['업무 설명', '인텐트', '엔티티', '다운로드']

export default function NlpBuildPage() {
  const { request } = useApi()
  const [step, setStep] = useState(1)
  const [description, setDescription] = useState('')
  const [intents, setIntents] = useState([])
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 임시 저장 복원 — 실패해도 화면은 떠야 한다(브라우저가 저장소를 막는 경우가 있다).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
      if (saved) {
        setStep(saved.step || 1)
        setDescription(saved.description || '')
        setIntents(saved.intents || [])
        setEntities(saved.entities || [])
      }
    } catch { /* 복원 실패는 무해하다 */ }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, description, intents, entities }))
    } catch { /* 저장 실패는 무해하다 */ }
  }, [step, description, intents, entities])

  // ⚠ useApi의 request가 내부에서 JSON.stringify를 한다 — 객체를 그대로 넘긴다(이중 직렬화 금지).
  //    loadingMessage는 전역 오버레이를 띄운다(v0.5.1 이후 모든 생성 동작의 공통 피드백).
  async function callStep(which, payload, loadingMessage) {
    setLoading(true)
    setError(null)
    try {
      return await request(API_ENDPOINTS.NLP_BUILD, {
        method: 'POST',
        body: { step: which, description, ...payload },
        loadingMessage,
      })
    } catch (e) {
      setError(e?.message || '요청에 실패했습니다.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function runIntents() {
    const res = await callStep('intents', {}, '인텐트를 만드는 중…')
    if (!res) return
    if (!res.intents?.length) { setError('인텐트를 만들지 못했습니다. 업무 설명을 더 구체적으로 적어 보세요.'); return }
    setIntents(res.intents)
    setStep(2)
  }

  async function runEntities() {
    const res = await callStep('entities', { intents }, '엔티티를 만드는 중…')
    if (!res) return
    // 서버가 intentName.ts 규칙으로 정규화한 인텐트를 함께 돌려준다 — 그것을 채택해야
    // 편집된 이름("반품 접수"·"반품/교환")이 그대로 CSV로 가지 않는다.
    // ⚠ editIntents를 쓰면 안 된다 — 방금 받은 엔티티를 지운다.
    if (res.intents?.length) setIntents(res.intents)
    setEntities(res.entities || [])
    setStep(3)
  }

  // 인텐트를 고치면 그것을 근거로 만든 엔티티는 더 이상 맞지 않는다.
  function editIntents(next) {
    setIntents(next)
    setEntities([])
  }

  const entitiesResult = entities.length ? toEntitiesCsv({ entities }) : null
  // 이름이 빈 인텐트는 서버가 버려 조용히 사라진다(서버도 400으로 막지만 여기서 먼저 막는다).
  const intentNamesFilled = intents.every((it) => (it.name ?? '').trim())


  // 잘림 경고는 엔티티를 검토하는 3단계와 실제로 파일을 받는 4단계 양쪽에 둔다.
  const truncationWarning = entitiesResult?.truncated?.length > 0 ? (
    <div className="mb-4 p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-sm">
      동의어가 13컬럼 규격을 넘어 잘린 항목이 있습니다:{' '}
      {entitiesResult.truncated.map((t) => `${t.entity}/${t.value} ${t.dropped}개`).join(', ')}
    </div>
  ) : null

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PageHeader
        title="NLP 만들기"
        description="업무 설명을 적으면 인텐트와 엔티티를 만들어 솔루션 업로드용 CSV로 내려받습니다."
      />

      <StepBar steps={STEPS} currentIndex={step - 1} />

      {error && (
        <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">
          {error}
        </div>
      )}

      {step === 1 && (
        <section>
          <textarea
            className="w-full h-40 border rounded p-3"
            placeholder="예: 반품 접수, 배송 조회, 매장 안내를 처리하는 고객 상담 챗봇"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="mt-3">
            <Button disabled={!description.trim() || loading} onClick={runIntents}>
              {loading ? '인텐트 만드는 중…' : '인텐트 만들기'}
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <p className="text-sm text-gray-600 mb-3">이름을 고치거나 필요 없는 인텐트를 지운 뒤 다음으로 넘어가세요.</p>
          <ul className="space-y-2 mb-4">
            {intents.map((it, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  className="border rounded px-2 py-1 flex-1"
                  value={it.name ?? ''}
                  onChange={(e) => editIntents(intents.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                />
                <span className="text-sm text-gray-500 w-24">예문 {it.examples?.length ?? 0}개</span>
                <Button variant="outline" onClick={() => editIntents(intents.filter((_, j) => j !== i))}>삭제</Button>
              </li>
            ))}
          </ul>
          {!intentNamesFilled && (
            <p className="mb-3 text-sm text-red-700">이름이 비어 있는 인텐트가 있습니다. 이름을 채우거나 삭제하세요.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>이전</Button>
            <Button disabled={!intents.length || !intentNamesFilled || loading} onClick={runEntities}>
              {loading ? '엔티티 만드는 중…' : '엔티티 만들기'}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          {entities.length === 0 ? (
            <p className="text-sm text-gray-600 mb-4">
              만들어진 엔티티가 없습니다. 발화로 갈리는 축이 없으면 정상이며, 이대로 진행할 수 있습니다.
            </p>
          ) : (
            <ul className="space-y-3 mb-4">
              {entities.map((ent, i) => (
                <li key={i} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <strong>{ent.name}</strong>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{ent.type}</span>
                      <Button variant="outline" onClick={() => setEntities(entities.filter((_, j) => j !== i))}>삭제</Button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {(ent.values || []).map((v) => `${v.value ?? ''} (동의어 ${v.synonyms?.length ?? 0})`).join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {truncationWarning}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>이전</Button>
            <Button onClick={() => setStep(4)}>다운로드로</Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section>
          <p className="text-sm text-gray-600 mb-4">
            인텐트 {intents.length}개 · 엔티티 {entities.length}개
          </p>
          {truncationWarning}
          <div className="flex gap-2">
            <Button onClick={() => downloadCsv('intents.csv', toIntentsCsv({ intents }))}>
              intents.csv
            </Button>
            <Button disabled={!entities.length}
                    onClick={() => downloadCsv('entities.csv', toEntitiesCsv({ entities }).csv)}>
              entities.csv
            </Button>
            <Button variant="outline" onClick={() => setStep(3)}>이전</Button>
          </div>
        </section>
      )}
    </div>
  )
}

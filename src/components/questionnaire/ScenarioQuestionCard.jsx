import { useEffect, useState } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardBody } from '../common/Card'
import { Button } from '../common/Button'
import { TemplateFieldInput } from './TemplateFieldInput'
import { ScenarioRefSelect } from './ScenarioRefSelect'
import { computeSharedPool, shouldShowField, isSeedIgnoredField, validateScenarios, validateApiIntegrations } from './scenarioFields'
import { TEMPLATE_FIELD_TYPES } from '../../lib/constants'
import { fullWidthFlags } from '../../lib/questions/fullWidthFlags'
import StepsEditor from './StepsEditor'
import { legacyToSteps, withDerivedLegacy, validateSteps, integrationStepPath } from '../../lib/scenario/steps'

// 흐름(단계)이 맡는 템플릿 필드 — 화면에서는 숨기고 단계에서 파생해 함께 저장한다(templates DB 무변경).
const STEP_OWNED_FIELDS = new Set(['수집 정보', '분기', '외부 연동'])
const stepsOf = (scenario) => (Array.isArray(scenario?.['단계']) ? scenario['단계'] : legacyToSteps(scenario || {}))
const hasRef = (scenario) => Boolean(String(scenario?.['레퍼런스 선택'] || '').trim())

// 빈 시나리오 생성(최상위 필드 기본값)
function makeEmptyScenario(template) {
  const scenario = {}
  for (const field of template?.fields || []) {
    scenario[field.name] =
      field.type === TEMPLATE_FIELD_TYPES.GROUP_LIST || field.type === TEMPLATE_FIELD_TYPES.MULTI_SELECT
        ? []
        : ''
  }
  return scenario
}

// 한 줄 전체를 쓰는 필드: 목록(group_list)·외부 연동·긴 글. 나머지(짧은 글·선택)는 2열로 나란히.
const isWideField = (field) =>
  field.type === TEMPLATE_FIELD_TYPES.GROUP_LIST || field.type === 'textarea'

const scenarioLabel = (scenario, index) => String(scenario?.['시나리오 이름'] || '').trim() || `시나리오 ${index + 1}`

// 시나리오 단계: 왼쪽 목록 + 오른쪽 편집기(선택한 시나리오 하나만 펼친다).
export const ScenarioQuestionCard = ({ question, template, value, onChange, onBlur = () => {}, error, focusTarget, industry = '' }) => {
  const scenarios = Array.isArray(value) ? value : []
  const [selected, setSelected] = useState(0)
  const active = Math.min(selected, Math.max(scenarios.length - 1, 0))

  // 검증 실패한 외부 연동이 다른 시나리오에 있으면 그 시나리오를 먼저 연다(연동 블록 스크롤은 ApiIntegrationField가 한다).
  useEffect(() => {
    if (focusTarget && Number.isInteger(focusTarget.scenarioIndex)) setSelected(focusTarget.scenarioIndex)
  }, [focusTarget?.nonce])

  // 단계 검증에서 오류가 나면 처음으로 미완성인 시나리오를 연다(외부 연동 오류는 위 focusTarget이 맡는다).
  useEffect(() => {
    if (!error || focusTarget) return
    const firstInvalid = scenarios.findIndex((sc) => !isValid(sc))
    if (firstInvalid >= 0) setSelected(firstInvalid)
  }, [error])

  const addScenario = () => {
    onChange([...scenarios, makeEmptyScenario(template)])
    setSelected(scenarios.length)
  }
  const removeScenario = (index) => {
    onChange(scenarios.filter((_, i) => i !== index))
    setSelected((cur) => (cur > index ? cur - 1 : cur === index ? Math.max(index - 1, 0) : cur))
  }
  const updateScenarioField = (index, fieldName, fieldValue) =>
    onChange(scenarios.map((s, i) => (i === index ? { ...s, [fieldName]: fieldValue } : s)))

  // 시나리오별 상태 — 통과면 ✓, 단계 검증에서 실패가 난 뒤(error 있음)에만 미통과 시나리오를 빨갛게 표시.
  const isValid = (scenario) =>
    !validateScenarios([scenario], template) && !validateApiIntegrations([scenario]) &&
    (hasRef(scenario) || !validateSteps(scenario?.['단계']))

  // 단계 변경 → 단계 저장 + 기존 키(수집 정보·외부 연동·분기) 파생 동기화
  const updateSteps = (index, nextSteps) =>
    onChange(scenarios.map((s, i) => (i === index ? withDerivedLegacy({ ...s, 단계: nextSteps }) : s)))

  const scenario = scenarios[active]
  const sIdx = active
  const sharedPool = scenario ? computeSharedPool(scenario, template) : null
  const steps = scenario ? stepsOf(scenario) : []
  // 검증 실패 위치 → 단계 카드 경로(단계 검증은 stepPath, API 연동 검증은 n번째 연동 → 경로). 갈래 안이면 편집기가 그 갈래를 연다.
  const focusStep = focusTarget && focusTarget.scenarioIndex === sIdx
    ? {
        path: Array.isArray(focusTarget.stepPath)
          ? focusTarget.stepPath
          : Number.isInteger(focusTarget.integrationIndex) ? integrationStepPath(steps, focusTarget.integrationIndex) : null,
        nonce: focusTarget.nonce,
      }
    : null

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-[#1F2937]">{question.text}</h3>
          <span className="text-xs text-[#6B7280]">템플릿: {template.name}</span>
        </div>
        {question.description && <p className="-mt-2 mb-4 text-sm text-[#6B7280]">{question.description}</p>}
        {template.description && <p className="-mt-2 mb-4 text-xs text-[#6B7280]">{template.description}</p>}

        {error && (
          <p role="alert" className="mb-4 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">{error}</p>
        )}

        <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)] items-start">
          {/* 시나리오 목록 */}
          <div className="md:sticky md:top-8">
            <ol className="flex gap-1 overflow-x-auto md:flex-col">
              {scenarios.map((sc, i) => {
                const valid = isValid(sc)
                return (
                  <li key={i} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      aria-current={i === active ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm transition-colors',
                        i === active ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700' : 'border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]',
                      )}
                    >
                      <span className="w-4 text-xs text-[#9CA3AF]">{i + 1}</span>
                      <span className="flex-1 truncate">{scenarioLabel(sc, i)}</span>
                      {valid
                        ? <Check className="h-4 w-4 shrink-0 text-[#059669]" aria-label="입력 완료" />
                        : error ? <AlertCircle className="h-4 w-4 shrink-0 text-[#DC2626]" aria-label="확인 필요" /> : null}
                    </button>
                  </li>
                )
              })}
            </ol>
            <Button type="button" variant="secondary" size="sm" onClick={addScenario} className="mt-2 w-full">+ 시나리오 추가</Button>
          </div>

          {/* 선택한 시나리오 편집기 */}
          {scenario ? (
            <div className="min-w-0 rounded-lg border border-[#E5E7EB] bg-white p-4">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-semibold text-[#1F2937]">시나리오 {sIdx + 1} · {scenarioLabel(scenario, sIdx)}</h4>
                <Button type="button" variant="danger" size="sm" onClick={() => removeScenario(sIdx)}>삭제</Button>
              </div>
              {/* 레퍼런스 선택(구조 시드) — templates 스키마와 무관한 가상 필드. 값은 시나리오 응답의 '레퍼런스 선택' 키로만 실린다. */}
              <ScenarioRefSelect
                id={`scenario-${sIdx}-ref`}
                value={scenario['레퍼런스 선택']}
                onChange={(v) => updateScenarioField(sIdx, '레퍼런스 선택', v)}
                category={industry}
              />
              {String(scenario['레퍼런스 선택'] || '').trim() && (
                <p className="mb-3 rounded-md border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
                  레퍼런스 선택됨 — 이 시나리오의 흐름·수집·연동은 레퍼런스 구조를 그대로 따릅니다. 아래 흐려진 항목은 입력해도 반영되지 않아요(진입 발화·AI 자유응답 설정만 반영).
                </p>
              )}
              <div className="grid gap-x-6 md:grid-cols-2">
                {(() => {
                  // 최상위 필드도 showWhen 지원 — 예: 'AI 지식소스'는 'AI 자유응답 사용=예'일 때만 표시
                  // 흐름(단계) 편집기는 템플릿에서 흐름이 맡는 첫 필드 자리에 한 번 넣는다.
                  const visible = []
                  let stepsPlaced = false
                  for (const field of template.fields || []) {
                    if (STEP_OWNED_FIELDS.has(field.name)) {
                      if (!stepsPlaced) { visible.push({ name: '단계', type: '__steps' }); stepsPlaced = true }
                      continue
                    }
                    if (shouldShowField(field, scenario)) visible.push(field)
                  }
                  const full = fullWidthFlags(visible, (f) => f.type === '__steps' || isWideField(f))
                  return visible.map((field, fIdx) => {
                  if (field.type === '__steps') {
                    const editor = (
                      <StepsEditor
                        key={`steps-${sIdx}`}
                        steps={steps}
                        template={template}
                        onChange={(next) => updateSteps(sIdx, next)}
                        focusStep={focusStep}
                        idPrefix={`scenario-${sIdx}-steps`}
                        title={String(scenario?.['시나리오 이름'] || '').trim() || `시나리오 ${sIdx + 1}`}
                      />
                    )
                    return hasRef(scenario)
                      ? <div key="단계" className="md:col-span-2 opacity-40 pointer-events-none select-none" aria-disabled="true">{editor}</div>
                      : <div key="단계" className="md:col-span-2">{editor}</div>
                  }
                  // 레퍼런스 선택 시 무시되는 필드는 비활성화(검증도 scenarioFields에서 함께 skip)
                  const seedIgnored = isSeedIgnoredField(field.name, scenario)
                  // '외부 연동'은 흐름(단계)의 연동 카드가 편집한다(STEP_OWNED_FIELDS) — 여기엔 시나리오 단위 필드만 온다.
                  const body = (
                    <TemplateFieldInput
                      field={field}
                      value={scenario[field.name]}
                      onChange={(v) => updateScenarioField(sIdx, field.name, v)}
                      sharedPool={sharedPool}
                      idPrefix={`scenario-${sIdx}`}
                      onBlur={onBlur}
                    />
                  )
                  const span = full[fIdx] ? 'md:col-span-2' : ''
                  return seedIgnored
                    ? <div key={field.name} className={cn(span, 'opacity-40 pointer-events-none select-none')} aria-disabled="true">{body}</div>
                    : <div key={field.name} className={span}>{body}</div>
                  })
                })()}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[#D1D5DB] p-8 text-center text-sm text-[#6B7280]">
              아직 시나리오가 없어요. 왼쪽의 <b>+ 시나리오 추가</b>로 시작하세요.
            </div>
          )}
        </div>

      </CardBody>
    </Card>
  )
}

export default ScenarioQuestionCard

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, X, ChevronRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '../common/Button'
import { FormInput } from '../common/FormInput'
import { SectionHelp } from '../common/SectionHelp'
import { TemplateFieldInput } from './TemplateFieldInput'
import ApiIntegrationField from './ApiIntegrationField'
import { STEP_TYPES, BRANCH_AFTER, varsAt, stepsAt, setStepsAt, branchStepCount, newStepId, makeEmptyIntegration, availableStepTypes } from '../../lib/scenario/steps'
import { describeStep, branchCondition } from '../../lib/scenario/describeStep'

// 시나리오 흐름(단계 목록) 편집기. 단계마다 카드 하나 — 순서대로 정보 받기·안내·연동·분기.
// 카드 안의 입력은 기존 편집기를 그대로 쓴다(정보 받기=템플릿 '수집 정보', 연동=ApiIntegrationField, 분기=템플릿 '분기'+이후).
// 각 단계가 고를 수 있는 변수는 앞 단계에서 만든 것만(varsAt).
// 분기 갈래마다 하위 흐름(단계)을 둘 수 있다 — 갈래로 '들어가서' 그 갈래의 단계만 편집한다(scope = 현재 위치 경로).
// 설계: docs/superpowers/specs/2026-10-20-scenario-steps-flow-design.md · docs/superpowers/specs/2026-10-21-branch-subflows-design.md

const BADGE = {
  [STEP_TYPES.COLLECT]: 'bg-[#EFF6FF] text-[#1D4ED8]',
  [STEP_TYPES.MESSAGE]: 'bg-[#F3F4F6] text-[#374151]',
  [STEP_TYPES.INTEGRATION]: 'bg-[#ECFDF5] text-[#047857]',
  [STEP_TYPES.BRANCH]: 'bg-[#FFFBEB] text-[#B45309]',
}

const FLOW_HELP = [
  '시나리오가 진행되는 순서대로 단계를 쌓아요. 봇은 위에서부터 차례로 진행해요.',
  '· 정보 받기: 사용자에게 물어서 받을 항목(한 단계에 여러 개 가능)',
  '· 안내: 봇이 보여줄 말',
  '· 연동: 외부 시스템 호출(API) 또는 내부 데이터 저장·조회(ESD)',
  "· 분기: 조건마다 봇의 행동을 적고, 그 뒤 '이어서 진행' 또는 '여기서 종료'를 골라요",
  "· 갈래에서 할 일이 여러 단계면 [열기 ›]로 그 갈래에 들어가 단계를 쌓아요(그러면 한 줄 행동은 비워도 돼요)",
  '· 보낼 정보·조건 대상에는 앞 단계에서 만든 변수만 떠요',
  '· 마무리 안내는 맨 아래 칸에 따로 적어요(비우면 자동)',
].join('\n')

function emptyStep(type, template) {
  const fieldOf = (name) => (template?.fields || []).find((f) => f.name === name)
  const emptyItem = (field) => {
    const item = {}
    for (const sub of field?.fields || []) item[sub.name] = sub.type === 'multi_select' ? [] : ''
    return item
  }
  const _id = newStepId()
  if (type === STEP_TYPES.COLLECT) return { _id, 유형: type, 항목: [emptyItem(fieldOf('수집 정보'))] }
  if (type === STEP_TYPES.MESSAGE) return { _id, 유형: type, 내용: '' }
  if (type === STEP_TYPES.INTEGRATION) return { _id, 유형: type, ...makeEmptyIntegration() }
  return { _id, 유형: type, 갈래: [{ ...emptyItem(fieldOf('분기')), 이후: BRANCH_AFTER.CONTINUE }] }
}

const stripType = (step) => {
  const { 유형: _t, _id: _i, ...rest } = step || {}
  return rest
}

const samePath = (a, b) => a.length === b.length && a.every((v, k) => v === b[k])

export default function StepsEditor({ steps, template, onChange, focusStep = null, idPrefix = 'steps', title = '' }) {
  const root = Array.isArray(steps) ? steps : []
  // 현재 위치: [] = 시나리오 최상위, [i, r] = i번째 분기의 r번째 갈래, [i, r, j, r2] = 그 안의 분기 갈래 …
  const [scope, setScope] = useState([])
  const list = stepsAt(root, scope)
  const cardRefs = useRef({})
  const [flash, setFlash] = useState(null)
  // 강조할 카드 — 갈래를 연 직후엔 카드가 아직 안 그려졌으므로 렌더 뒤에 처리한다.
  const [pendingFocus, setPendingFocus] = useState(null)

  // 위치가 사라지면(갈래·분기 삭제, 단계 이동) 최상위로.
  useEffect(() => {
    let l = root
    for (let d = 0; d + 1 < scope.length; d += 2) {
      const row = l[scope[d]]?.갈래?.[scope[d + 1]]
      if (l[scope[d]]?.유형 !== STEP_TYPES.BRANCH || !row) { setScope([]); return }
      l = Array.isArray(row.단계) ? row.단계 : []
    }
  }, [root, scope])

  // 검증 실패 위치(경로)로: 그 갈래를 열고 카드로 스크롤 + 1.5초 강조. nonce가 바뀔 때마다 재트리거.
  // ⚠ nonce(새 검증 실패)에만 반응한다 — 경로는 렌더마다 다시 계산될 수 있어(n번째 연동), 편집 중 연동 순서가 바뀌면
  // 요청 없이 다른 갈래로 끌려간다(최종 리뷰 #2). 경로는 ref로 읽는다.
  const focusPathRef = useRef(null)
  focusPathRef.current = focusStep?.path
  useEffect(() => {
    const path = focusPathRef.current
    if (!Array.isArray(path) || !path.length) return
    const target = path.slice(0, -1)
    setScope(target)
    setPendingFocus({ index: path[path.length - 1], scope: target })
  }, [focusStep?.nonce])

  useEffect(() => {
    if (!pendingFocus) return
    // 강조 대상 목록에서 벗어났으면(사용자가 다른 갈래로 이동) 버린다 — 엉뚱한 카드가 강조되지 않게(최종 리뷰 #4).
    if (!samePath(pendingFocus.scope, scope)) { setPendingFocus(null); return }
    const node = cardRefs.current[pendingFocus.index]
    setPendingFocus(null)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(pendingFocus.index)
  }, [pendingFocus, scope])

  // 강조는 1.5초 뒤 해제(위 효과와 분리 — pendingFocus를 비우며 다시 돌 때 타이머가 지워지지 않게).
  useEffect(() => {
    if (flash == null) return
    const t = setTimeout(() => setFlash(null), 1500)
    return () => clearTimeout(t)
  }, [flash])

  const fieldOf = (name) => (template?.fields || []).find((f) => f.name === name)
  const collectField = fieldOf('수집 정보')
  const branchField = fieldOf('분기')
  // 분기 갈래 = 템플릿 '분기' 하위 필드 + 이후(이어서 진행/여기서 종료)
  // '그 경우 봇의 행동'은 갈래에 하위 단계가 없을 때만 필수(validateSteps가 판단) — 칸 자체는 선택으로 표시.
  const branchFieldWithAfter = branchField && {
    ...branchField,
    label: '갈래',
    fields: [
      ...(branchField.fields || []).map((f) => (f.name === '그 경우 봇의 행동' ? { ...f, required: false, help: '갈래를 열어 단계를 쌓으면 비워도 돼요' } : f)),
      { name: '이후', type: 'select', options: [BRANCH_AFTER.CONTINUE, BRANCH_AFTER.END], required: true },
    ],
  }

  const setList = (next) => onChange(setStepsAt(root, scope, next))
  const update = (i, next) => setList(list.map((s, k) => (k === i ? next : s)))
  const remove = (i) => setList(list.filter((_, k) => k !== i))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    setList(next)
  }
  const add = (type) => setList([...list, emptyStep(type, template)])
  // 위치를 옮기면 강조를 지운다 — flash는 index만 들고 있어 다른 목록의 같은 자리 카드가 깜빡인다(최종 리뷰 #5).
  const goTo = (next) => { setScope(next); setFlash(null) }
  const open = (i, r) => goTo([...scope, i, r])

  // 위치 표시: 시나리오 › 3 분기 › 갈래 1(조건) › …
  const crumbs = [{ label: title || '흐름', scope: [] }]
  {
    let l = root
    for (let d = 0; d + 1 < scope.length; d += 2) {
      const step = l[scope[d]]
      const row = step?.갈래?.[scope[d + 1]]
      const cond = branchCondition(row)
      crumbs.push({ label: `${scope[d] + 1} 분기 › 갈래 ${scope[d + 1] + 1}${cond ? ` (${cond})` : ''}`, scope: scope.slice(0, d + 2) })
      l = Array.isArray(row?.단계) ? row.단계 : []
    }
  }
  // 열린 갈래(그 끝 선택: 이어서/종료)
  const openRow = scope.length ? stepsAt(root, scope.slice(0, -2))[scope[scope.length - 2]]?.갈래?.[scope[scope.length - 1]] : null
  const setOpenRowAfter = (after) => {
    const parentScope = scope.slice(0, -2)
    const parent = stepsAt(root, parentScope)
    const i = scope[scope.length - 2]
    const r = scope[scope.length - 1]
    onChange(setStepsAt(root, parentScope, parent.map((st, k) => k !== i ? st : {
      ...st, 갈래: st.갈래.map((row, j) => (j === r ? { ...row, 이후: after } : row)),
    })))
  }

  return (
    <div className="mb-4 md:col-span-2">
      <label className="mb-2 block text-sm font-semibold text-[#1F2937]">흐름 (단계)</label>
      <SectionHelp text={FLOW_HELP} />
      {scope.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-sm">
          <Button type="button" variant="secondary" size="sm" onClick={() => goTo(scope.slice(0, -2))}>
            <ArrowLeft className="mr-1 h-4 w-4" />돌아가기
          </Button>
          <nav aria-label="흐름 위치" className="flex min-w-0 flex-wrap items-center gap-1 text-[#92400E]">
            {crumbs.map((c, k) => (
              <span key={k} className="flex items-center gap-1">
                {k > 0 && <ChevronRight className="h-3 w-3" />}
                {k === crumbs.length - 1
                  ? <span className="font-semibold">{c.label}</span>
                  : <button type="button" className="underline-offset-2 hover:underline" onClick={() => goTo(c.scope)}>{c.label}</button>}
              </span>
            ))}
          </nav>
        </div>
      )}
      {list.length === 0 && (
        <p className="mb-3 rounded-md border border-dashed border-[#D1D5DB] px-3 py-4 text-center text-sm text-[#6B7280]">
          {scope.length ? '이 갈래에서 할 일을 단계로 추가하세요.' : '아직 단계가 없어요. 아래 버튼으로 첫 단계를 추가하세요.'}
        </p>
      )}
      <ol className="space-y-3">
        {list.map((step, i) => {
          const pool = varsAt(root, [...scope, i])
          const type = step?.유형
          return (
            <li
              key={step?._id || `idx-${scope.join('.')}-${i}`}
              ref={(el) => { cardRefs.current[i] = el }}
              className={cn(
                'scroll-mt-24 rounded-lg border bg-[#FAFBFC] p-3 transition-shadow',
                flash === i ? 'border-[#EF4444] ring-2 ring-[#EF4444]' : 'border-[#E5E7EB]',
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1F2937] text-xs font-semibold text-white">{i + 1}</span>
                <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', BADGE[type] || BADGE[STEP_TYPES.MESSAGE])}>{type}</span>
                <span className="flex-1 truncate text-xs text-[#6B7280]">{describeStep(step).split(' · ').slice(1).join(' · ')}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" className="rounded p-1 text-[#6B7280] hover:bg-[#E5E7EB] disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="아래로" className="rounded p-1 text-[#6B7280] hover:bg-[#E5E7EB] disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(i)} aria-label="단계 삭제" className="rounded p-1 text-[#DC2626] hover:bg-[#FEE2E2]"><X className="h-4 w-4" /></button>
              </div>

              {type === STEP_TYPES.COLLECT && collectField && (
                <TemplateFieldInput
                  field={{ ...collectField, label: '받을 항목' }}
                  value={step.항목}
                  onChange={(v) => update(i, { ...step, 항목: v })}
                  sharedPool={pool}
                  idPrefix={`${idPrefix}-${[...scope, i].join('-')}`}
                />
              )}
              {type === STEP_TYPES.MESSAGE && (
                <FormInput
                  id={`${idPrefix}-${[...scope, i].join('-')}-msg`} name={`${idPrefix}-${[...scope, i].join('-')}-msg`} type="textarea" label="안내 내용" required
                  help="봇이 이 자리에서 보여줄 말. 문장으로 적으면 그대로, '개인정보 수집 동의 안내'처럼 할 일만 적으면 그 뜻대로 문장을 만들어요."
                  value={step.내용 || ''} onChange={(e) => update(i, { ...step, 내용: e.target.value })}
                />
              )}
              {type === STEP_TYPES.INTEGRATION && (
                <ApiIntegrationField
                  single
                  value={[stripType(step)]}
                  onChange={(arr) => update(i, { _id: step._id, 유형: STEP_TYPES.INTEGRATION, ...(arr?.[0] || {}) })}
                  idPrefix={`${idPrefix}-${step?._id || i}-int`}
                  sharedPool={pool}
                  focusIntegration={Array.isArray(focusStep?.path) && samePath(focusStep.path, [...scope, i]) ? { index: 0, nonce: focusStep.nonce } : null}
                />
              )}
              {type === STEP_TYPES.BRANCH && branchFieldWithAfter && (
                <>
                  <TemplateFieldInput
                    field={branchFieldWithAfter}
                    value={step.갈래}
                    // 갈래 칸 편집기는 행 객체를 펼쳐 고치고(filter로 삭제) — 하위 단계(단계)는 그 행에 그대로 남는다.
                    onChange={(v) => update(i, { ...step, 갈래: v })}
                    sharedPool={pool}
                    idPrefix={`${idPrefix}-${[...scope, i].join('-')}`}
                  />
                  <div className="mt-2 rounded-md border border-[#FDE68A] bg-white p-2">
                    <p className="mb-1 text-xs font-semibold text-[#92400E]">갈래별 흐름</p>
                    <ul className="space-y-1">
                      {(Array.isArray(step.갈래) ? step.갈래 : []).map((row, r) => (
                        <li key={r} className="flex items-center gap-2 text-sm">
                          <span className="shrink-0 text-xs text-[#6B7280]">갈래 {r + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-[#374151]">
                            {branchCondition(row) || '(조건 미입력)'}
                            <span className="ml-2 text-xs text-[#6B7280]">
                              {branchStepCount(row) ? `${branchStepCount(row)}단계` : '한 줄 행동'} · {row?.이후 === BRANCH_AFTER.END ? '종료' : '이어서'}
                            </span>
                          </span>
                          <Button type="button" variant="secondary" size="sm" onClick={() => open(i, r)}>
                            열기<ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ol>
      {openRow && (
        <fieldset className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-[#E5E7EB] px-3 py-2 text-sm">
          <legend className="px-1 text-xs font-semibold text-[#6B7280]">이 갈래가 끝나면</legend>
          {[BRANCH_AFTER.CONTINUE, BRANCH_AFTER.END].map((opt) => (
            <label key={opt} className="flex items-center gap-1">
              <input type="radio" name={`${idPrefix}-${scope.join('-')}-after`} checked={(openRow.이후 || BRANCH_AFTER.CONTINUE) === opt} onChange={() => setOpenRowAfter(opt)} />
              {opt === BRANCH_AFTER.CONTINUE ? '이어서 진행 (분기 다음 단계로)' : '여기서 종료 (마무리 안내)'}
            </label>
          ))}
        </fieldset>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* 템플릿에 해당 필드가 있는 유형만(없으면 빈 카드가 생긴다) */}
        {availableStepTypes(template).map((t) => (
          <Button key={t} type="button" variant="secondary" size="sm" onClick={() => add(t)}>+ {t}</Button>
        ))}
      </div>
    </div>
  )
}

// 시나리오 흐름(단계 목록) ↔ 기존 키(수집 정보·외부 연동·분기) 변환 — 순수 함수, 프론트·생성기 공용.
// 설계: docs/superpowers/specs/2026-10-20-scenario-steps-flow-design.md
// 단계가 단일 소스다. 결정론 코드(반복·검증 루프, API 파생 등)는 파생된 기존 키를 읽고,
// LLM 프롬프트는 단계만 본다(promptView). 단계가 없는 입력은 손대지 않는다 — 생성 경로 불변.

export const STEP_TYPES = { COLLECT: '정보 받기', MESSAGE: '안내', INTEGRATION: '연동', BRANCH: '분기' }
export const BRANCH_AFTER = { CONTINUE: '이어서 진행', END: '여기서 종료' }
const LEGACY_KEYS = ['수집 정보', '외부 연동', '분기']

/** 새 연동 항목 기본값 — 연동 편집기의 '+ 추가'와 흐름의 '+ 연동'이 같은 값을 쓰게 한 곳에 둔다. */
export function makeEmptyIntegration() {
  return {
    '연동 방식': '외부 시스템 호출 (API)', '연동 목적': '', '보낼 정보': [], '사용할 API': '새로 입력',
    'API 이름': '', '엔드포인트 URL': '', method: 'GET', '헤더': [],
    '파라미터': [], '바디': [], '바디 형식': 'kv', '바디 JSON': '',
    '파라미터 설명': '', '결과를 담을 이름': '', _tested: false,
  }
}

// 단계 유형 ↔ 그 유형이 쓰는 템플릿 필드(안내는 템플릿과 무관)
const STEP_FIELD = { '정보 받기': '수집 정보', '연동': '외부 연동', '분기': '분기' }

/** 템플릿에 해당 필드가 있는 단계 유형만(추가 버튼용). 순서: 정보 받기·안내·연동·분기. */
export function availableStepTypes(template) {
  const names = new Set((template?.fields || []).map((f) => f?.name))
  return ['정보 받기', '안내', '연동', '분기'].filter((t) => !STEP_FIELD[t] || names.has(STEP_FIELD[t]))
}

const arr = (v) => (Array.isArray(v) ? v : [])
const filled = (v) => typeof v === 'string' ? v.trim().length > 0 : v != null && !(Array.isArray(v) && v.length === 0)
const hasSteps = (s) => Array.isArray(s?.['단계'])

// 단계 카드의 고유 id(React key) — 카드를 지우거나 옮겨도 편집기 내부 상태(API 테스트 결과 등)가 다른 단계로 넘어가지 않게.
// 저장된 응답에는 남아도 되지만(_ 접두는 결과 화면에서 숨김) 기존 키·LLM 프롬프트로는 내보내지 않는다.
let seq = 0
export function newStepId() {
  seq += 1
  return `s${Date.now().toString(36)}${seq.toString(36)}`
}

function stripType(step) {
  const { 유형: _t, _id: _i, ...rest } = step || {}
  return rest
}

// _id를 지운 사본 — 갈래 안 하위 단계까지 재귀.
const stripId = (step) => {
  const { _id: _i, ...rest } = step || {}
  if (Array.isArray(rest.갈래)) rest.갈래 = rest.갈래.map((r) => (hasSteps(r) ? { ...r, 단계: r.단계.map(stripId) } : r))
  return rest
}

// ── 갈래 하위 흐름(경로) ─────────────────────────────────────────────
// 설계: docs/superpowers/specs/2026-10-21-branch-subflows-design.md
// 경로 = [단계, 갈래, 단계, 갈래, …, 단계]. 목록 위치(scope)는 짝수 길이([] = 최상위, [i, r] = i번째 분기의 r번째 갈래).

const rowSteps = (row) => arr(row?.단계)

/** 갈래의 하위 단계 수(없으면 0). */
export const branchStepCount = (row) => rowSteps(row).length

/** scope 위치의 단계 목록. 없는 위치면 []. */
export function stepsAt(steps, scope) {
  let list = arr(steps)
  for (let d = 0; d + 1 < arr(scope).length; d += 2) list = rowSteps(list[scope[d]]?.갈래?.[scope[d + 1]])
  return list
}

/** scope 위치의 단계 목록을 next로 바꾼 사본(불변). */
export function setStepsAt(steps, scope, next) {
  if (!arr(scope).length) return next
  const [i, r, ...rest] = scope
  const list = arr(steps)
  return list.map((st, k) => k !== i ? st : {
    ...st,
    갈래: arr(st?.갈래).map((row, j) => (j !== r ? row : { ...row, 단계: setStepsAt(rowSteps(row), rest, next) })),
  })
}

/** 깊이 우선 순회 — fn(step, path). 갈래의 하위 단계는 그 분기 단계 바로 뒤에 방문한다. */
function walk(steps, fn, prefix = []) {
  arr(steps).forEach((step, i) => {
    const path = [...prefix, i]
    fn(step, path)
    if (step?.유형 === STEP_TYPES.BRANCH) arr(step.갈래).forEach((row, r) => walk(rowSteps(row), fn, [...path, r]))
  })
}

// 단계에서 '선택'으로 고른 변수 값들(보낼 정보, 분기 조건 대상). '직접 입력'은 변수가 아니다.
const DIRECT_INPUT = '직접 입력'
function referencedVars(step) {
  if (step?.유형 === STEP_TYPES.INTEGRATION) return arr(step['보낼 정보']).map((v) => String(v).trim()).filter(Boolean)
  if (step?.유형 === STEP_TYPES.BRANCH) {
    return arr(step.갈래).map((r) => String(r?.['조건 대상'] || '').trim()).filter((v) => v && v !== DIRECT_INPUT)
  }
  return []
}

/** 템플릿 필수 검증(validateScenarios)을 건너뛰고 단계 검증(validateSteps)에 맡길 필드인가.
 * 단계가 있으면 '분기' 행은 파생값이고, 하위 단계가 있는 갈래는 '그 경우 봇의 행동'을 비워도 된다. */
export function isStepValidatedField(fieldName, scenario) {
  return fieldName === '분기' && hasSteps(scenario)
}

/** 단계 → 기존 키. 단계가 없으면 null. */
export function stepsToLegacy(scenario) {
  if (!hasSteps(scenario)) return null
  const out = { '수집 정보': [], '외부 연동': [], '분기': [] }
  // 깊이 우선(갈래 안까지). 분기 행에는 하위 단계를 싣지 않는다 — 결정론 코드는 평평한 목록만 본다.
  walk(scenario['단계'], (step) => {
    if (step?.유형 === STEP_TYPES.COLLECT) out['수집 정보'].push(...arr(step.항목))
    else if (step?.유형 === STEP_TYPES.INTEGRATION) out['외부 연동'].push(stripType(step))
    else if (step?.유형 === STEP_TYPES.BRANCH) {
      out['분기'].push(...arr(step.갈래).map((r) => {
        const { 단계: _s, ...row } = r || {}
        return row
      }))
    }
  })
  return out
}

/** 기존 키 → 단계(화면 편집용). 순서: 정보 받기 하나 → 연동 각각 → 분기 하나. */
export function legacyToSteps(scenario) {
  const steps = []
  const collects = arr(scenario?.['수집 정보'])
  // id는 위치 기반(결정론) — 아직 단계로 저장되지 않은 예전 데이터는 렌더마다 다시 변환되므로, 매번 같은 id여야 카드가 재마운트되지 않는다.
  const id = () => `legacy-${steps.length}`
  if (collects.length) steps.push({ _id: id(), 유형: STEP_TYPES.COLLECT, 항목: collects })
  for (const ext of arr(scenario?.['외부 연동'])) steps.push({ _id: id(), 유형: STEP_TYPES.INTEGRATION, ...ext })
  const rows = arr(scenario?.['분기'])
  if (rows.length) steps.push({ _id: id(), 유형: STEP_TYPES.BRANCH, 갈래: rows.map((r) => ({ 이후: BRANCH_AFTER.CONTINUE, ...r })) })
  return steps
}

/** 단계가 있으면 기존 키를 단계에서 파생해 덮어쓴 사본. 없으면 원본. */
export function withDerivedLegacy(scenario) {
  const legacy = stepsToLegacy(scenario)
  return legacy ? { ...scenario, ...legacy } : scenario
}

/** LLM에 넣을 모양: 단계가 있고 레퍼런스 미선택이면 기존 세 키를 뺀다(같은 내용이 두 번 들어가 노드가 중복되는 걸 막음). */
export function promptView(scenario) {
  if (!hasSteps(scenario)) return scenario
  const out = { ...scenario }
  // 레퍼런스 선택(구조 시드) 시나리오는 시드가 구조를 덮으므로 단계를 빼서 기능 이전 입력과 같게 둔다.
  if (String(scenario?.['레퍼런스 선택'] || '').trim()) {
    delete out['단계']
    return out
  }
  for (const k of LEGACY_KEYS) delete out[k]
  out['단계'] = scenario['단계'].map(stripId)
  return out
}

/** 응답 객체에서 시나리오 배열(객체 배열)인 값의 각 시나리오에 fn을 적용한 사본.
 * @param {Record<string, any>} responses
 * @param {(s: any) => any} fn
 * @returns {Record<string, any>}
 */
export function mapScenarioResponses(responses, fn) {
  const out = {}
  for (const [k, v] of Object.entries(responses || {})) {
    out[k] = Array.isArray(v) && v.length > 0 && v.every((s) => s && typeof s === 'object' && !Array.isArray(s))
      ? v.map(fn)
      : v
  }
  return out
}

// 한 단계가 만드는 변수: 정보 받기의 변수명(없으면 항목명), 연동의 결과를 담을 이름,
// 분기면 '이어서 진행' 갈래 안에서 만든 변수(종료 갈래는 뒤로 이어지지 않는다).
function varsMadeBy(step) {
  if (step?.유형 === STEP_TYPES.COLLECT) {
    return arr(step.항목).map((it) => String(it?.변수명 || '').trim() || String(it?.항목명 || '').trim()).filter(Boolean)
  }
  if (step?.유형 === STEP_TYPES.INTEGRATION) {
    const v = String(step['결과를 담을 이름'] || '').trim()
    return v ? [v] : []
  }
  if (step?.유형 === STEP_TYPES.BRANCH) {
    return arr(step.갈래).filter((r) => r?.이후 !== BRANCH_AFTER.END).flatMap((r) => rowSteps(r).flatMap(varsMadeBy))
  }
  return []
}

/** 경로의 단계에서 쓸 수 있는 변수: 바깥 목록들의 앞 단계 + 같은 목록의 앞 단계가 만든 변수. 다른 갈래의 변수는 없다. */
export function varsAt(steps, path) {
  const pool = []
  let list = arr(steps)
  const p = arr(path)
  for (let d = 0; d < p.length; d += 2) {
    for (const step of list.slice(0, Math.max(0, p[d]))) pool.push(...varsMadeBy(step))
    if (d + 1 < p.length) list = rowSteps(list[p[d]]?.갈래?.[p[d + 1]])
  }
  return Array.from(new Set(pool))
}

/** 최상위 단계 k에서 쓸 수 있는 변수(varsAt의 최상위 판). */
export function varsBefore(steps, k) {
  return varsAt(steps, [k])
}

/** n번째 연동 단계(깊이 우선 — stepsToLegacy의 '외부 연동' 순서와 같다)의 경로. 없으면 null. */
export function integrationStepPath(steps, n) {
  let seen = -1
  let found = null
  walk(steps, (step, path) => {
    if (!found && step?.유형 === STEP_TYPES.INTEGRATION && ++seen === n) found = path
  })
  return found
}

/** 단계 자체 검증(정보 받기 항목·연동은 기존 검증이 파생 키로 맡는다). 갈래 안 단계까지 재귀.
 * 실패 시 { message, path, stepIndex }(stepIndex = 최상위 단계 위치). */
export function validateSteps(steps) {
  let fail = null
  walk(steps, (step, path) => {
    if (fail) return
    const msg = stepError(step, path, steps)
    if (msg) fail = { message: pathLabel(steps, path) + msg, path, stepIndex: path[0] }
  })
  return fail
}

// "3번째 단계(분기) › 갈래 1 › 2번째 단계(안내): "
function pathLabel(steps, path) {
  const parts = []
  let list = arr(steps)
  for (let d = 0; d < path.length; d += 2) {
    const step = list[path[d]]
    parts.push(`${path[d] + 1}번째 단계(${step?.유형 || '?'})`)
    if (d + 1 < path.length) {
      parts.push(`갈래 ${path[d + 1] + 1}`)
      list = rowSteps(step?.갈래?.[path[d + 1]])
    }
  }
  return parts.join(' › ') + ': '
}

function stepError(step, path, steps) {
  // 순서를 바꾼 뒤 남은 선택값: 앞 단계에 없는 변수를 쓰면 막는다(뒤나 다른 갈래에서 만든 변수는 값이 없다).
  const pool = varsAt(steps, path)
  const stale = referencedVars(step).find((v) => !pool.includes(v))
  if (stale) return `'${stale}'은(는) 이 단계보다 앞에서 만든 정보가 아니에요. 단계 순서를 확인하거나 선택을 바꿔주세요`
  if (step?.유형 === STEP_TYPES.MESSAGE && !filled(step.내용)) return '안내할 내용을 적어주세요'
  if (step?.유형 === STEP_TYPES.COLLECT && !arr(step.항목).length) return '받을 항목을 하나 이상 추가해주세요'
  if (step?.유형 === STEP_TYPES.BRANCH) {
    const rows = arr(step.갈래)
    if (!rows.length) return '갈래를 하나 이상 추가해주세요'
    for (const r of rows) {
      const hasCond = (filled(r?.['조건 대상']) && filled(r?.연산자)) || filled(r?.['직접 입력 조건'])
      if (!hasCond) return "갈래마다 조건(조건 대상+연산자, 또는 '직접 입력 조건')을 적어주세요"
      // 갈래에 하위 단계가 있으면 그게 갈래의 할 일 — 한 줄 행동은 선택.
      if (!branchStepCount(r) && !filled(r?.['그 경우 봇의 행동'])) return "갈래마다 '그 경우 봇의 행동'을 적거나, 갈래를 열어 단계를 추가해주세요"
    }
  }
  return null
}

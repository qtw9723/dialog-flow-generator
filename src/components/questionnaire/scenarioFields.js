import { TEMPLATE_FIELD_TYPES } from '../../lib/constants'
import { isStepValidatedField } from '../../lib/scenario/steps'

// optionsSource 값: 공유 변수 풀을 옵션으로 사용
export const SHARED_VARIABLE_POOL = 'sharedVariablePool'

// 시나리오 입력 필드별 도움말(UI 표시용 카피).
// group_list 필드는 섹션 상단 안내 박스로, 일반 필드는 라벨 옆 ⓘ 툴팁으로 렌더된다.
// DB 템플릿 필드에 `help`가 있으면 그쪽이 우선한다(getFieldHelp 참고).
export const SCENARIO_FIELD_HELP = {
  // 최상위 필드
  '시나리오 이름': "이 대화 갈래의 이름(관리용 라벨). 봇 메시지에는 나오지 않아요. 예: '진료 예약', '회원 조회'.",
  '진입 발화': "사용자가 무슨 말을 하면 이 시나리오가 시작되는지. 예상 발화를 줄바꿈으로 여러 개 적어도 돼요. 예: '예약하고 싶어요', '진료 예약'.",
  '완료 시 결과': "시나리오가 끝날 때 봇이 마지막으로 하는 말(선택). 문장으로 적으면 그대로 쓰고, '예약 접수 안내'처럼 할 일만 적으면 그 뜻대로 문장을 만들어요. 비우면 '업무가 처리되었다'는 안내와 이 시나리오에서 받은·조회한 정보를 보여주며 마무리해요. 예: '예약이 완료되었습니다. 예약번호는 ${예약번호}입니다.'",
  '상담사 연결 조건': "사람 상담사에게 넘겨야 하는 상황. 비워두면 봇만 처리해요. 예: '3회 이상 인식 실패 시', '환불 요청 시'.",

  // 수집 정보 (group)
  '수집 정보': [
    '봇이 사용자에게서 받아야 할 정보 목록이에요.',
    '· 항목마다 사람용 이름(항목명)과, 코드에서 쓸 변수명(선택)을 적어요',
    '· 변수명(없으면 항목명)이 변수가 되어 분기·외부 연동에서 쓰여요',
    '· 입력받을 항목마다 한 줄씩 추가',
    '· 받을 정보가 없으면 비워둬도 됩니다',
  ].join('\n'),
  '항목명': "받을 정보의 사람용 이름(라벨). 봇 안내에 쓰여요. 예: '이름', '전화번호', '예약일'.",
  '변수명': "분기·외부 연동·멘트에서 쓸 변수 이름(영문·숫자·밑줄). 비우면 생성 시 LLM이 항목명을 보고 영문으로 지어줘요(선택). 예: 'name', 'phone', 'reservationDate'.",
  '필수 여부': '필수면 받을 때까지 봇이 다시 물어요. 선택이면 없어도 다음으로 넘어가요.',
  '입력 형식': '사용자가 입력할 값의 형태. 검증 가능한 형식(숫자·날짜·전화번호·이메일·시간)은 형식에 맞게 입력할 때까지 봇이 되물어요. (자유텍스트·숫자·날짜·전화번호·이메일·시간·기타)',
  '여러 개 입력': "‘예’면 사용자가 ‘그만’이라고 할 때까지 이 항목을 여러 번 받아 목록으로 모아요(예: 주문 메뉴 여러 개). 한 개만 받으면 ‘아니오’.",
  '없을 때 되묻는 말': "사용자가 이 항목을 안 줬을 때 봇이 다시 물을 말. 예: '예약하실 날짜를 알려주세요'.",

  // 분기 (group)
  분기: [
    "분기는 '갈림길'이 실제로 있을 때만 추가하세요.",
    '· 조회 성공/실패처럼 봇 행동이 달라지는 지점에만 사용',
    '· 각 경우를 한 줄씩 추가 (예: 회원 / 비회원)',
    "· 조건 대상에는 앞 단계에서 만든 변수가 떠요",
    '· 갈림길이 없으면 비워둬도 됩니다',
  ].join('\n'),
  '조건 대상': "무엇을 보고 판단할지 고릅니다. 앞 단계에서 만든 변수가 목록에 떠요. 없으면 '직접 입력'을 골라 자연어로 적으세요.",
  연산자: '어떻게 비교할지. 같음=정확히 일치, 포함=일부 포함, 패턴일치=형식(이메일·전화 등) 일치.',
  값: "비교할 기준값. 예: 연산자가 '같음'이면 '회원'.",
  '직접 입력 조건': "변수로 표현하기 어려운 조건을 자연어로 적으세요. 예: '조회 결과 예약 가능한 슬롯이 하나도 없을 때'.",
  '그 경우 봇의 행동': "그 조건이 맞을 때 봇이 할 일. 예: '대기 신청을 안내하고 상담사 연결을 제안한다'.",

  // 외부 연동 (group, ApiIntegrationField에서 렌더)
  '외부 연동': [
    '봇이 외부 시스템과 데이터를 주고받아야 할 때 추가해요.',
    '· API = 외부 시스템 호출, ESD = 내부 데이터 저장·조회',
    "· 보낼 정보엔 앞 단계에서 만든 변수가 떠요",
    '· 결과를 담을 이름이 변수가 되어 이후 멘트·분기에서 쓰여요',
    '· 외부 연동이 없으면 비워둬도 됩니다',
  ].join('\n'),
  '연동 방식': '외부 시스템을 호출하면 API, 내부 데이터를 저장·조회하면 ESD를 고르세요.',
  '연동 목적': "이 연동이 무엇을 하는지 한 줄로. 예: '회원 정보 조회', '예약 정보 저장'.",
  '보낼 정보': "외부로 보낼 값. 앞 단계에서 받은 정보(변수)가 목록에 떠요.",
  '결과를 담을 이름': "받아온 결과를 저장할 변수 이름. 이후 멘트·분기에서 쓸 수 있어요. 예: '회원정보', '예약결과'.",
  '사용할 API': "이미 등록된 API를 고르거나 '새로 입력'으로 직접 정의하세요. 새로 입력한 API는 테스트 통과 후 '라이브러리에 등록' 버튼을 누르면 다음에 재사용할 수 있어요(등록 안 해도 이번 시나리오엔 그대로 쓰여요).",
  'API 이름': "API를 식별할 영문 이름. 예: 'getMember', 'createReservation'. 비워두면 생성 시 LLM이 적절한 이름을 지어줘요(선택).",
  '엔드포인트 URL': "호출할 주소. 변수는 ${항목명} 형태로 넣어요. 예: 'https://.../members/${전화번호}'.",
  method: '조회는 보통 GET, 생성·저장은 POST를 써요.',
  '헤더': '요청 헤더(key-value). 인증 토큰 등. 값에 ${변수} 사용 가능.',
  '파라미터': "조회(GET·DELETE)에서 보낼 쿼리 파라미터(key-value). ?key=value로 붙어요. 값에 ${변수} 사용 가능. 예: patientId → ${환자ID}.",
  '바디': "요청 본문. POST·PUT·PATCH에서 보낼 데이터. key-value로 넣거나 'JSON'으로 통째 붙여넣을 수 있어요. 값에 ${변수} 사용 가능.",
  '파라미터 설명': "어떤 수집 정보를 API의 어느 값으로 보내는지 설명. 예: '전화번호 → phone 파라미터'.",
  'ESD 받을 정보': "조회했을 때 봇이 사용자에게 보여줄 값을 쉼표로 적어요. 예: '보장률, 잔여 한도, 공제금'. 적으면 그 값이 ESD 스키마 필드가 되고 멘트에 그대로 쓰여요. 저장만 하거나 비워두면 '시나리오 마무리 안내'를 보고 생성 시 알맞은 값을 정해요.",
  '받을 정보': "API 응답에서 봇이 사용자에게 보여줄/쓸 값(필드명)을 쉼표로 적어요. 예: 'temp, condition, city'. 적으면 그 필드를 그대로 멘트에 써요. 비우면 응답을 보고 생성 시 알맞은 값을 골라 보여줘요.",
}

// 필드의 도움말 텍스트를 반환(없으면 null). DB 템플릿의 field.help가 있으면 우선.
export function getFieldHelp(field) {
  return field?.help || SCENARIO_FIELD_HELP[field?.name] || null
}

// 필드명으로 도움말을 직접 조회(커스텀 에디터용). 없으면 null.
export function getHelpByName(name) {
  return SCENARIO_FIELD_HELP[name] || null
}

// 한 시나리오 내 참조 가능한 변수 이름 목록.
// group_list 하위 필드 중 contributesToPool=true 인 필드의 입력값을 모은다.
export function computeSharedPool(scenario, template) {
  const pool = []
  for (const field of template?.fields || []) {
    if (field.type !== TEMPLATE_FIELD_TYPES.GROUP_LIST) continue
    const items = Array.isArray(scenario?.[field.name]) ? scenario[field.name] : []
    for (const sub of field.fields || []) {
      if (!sub.contributesToPool) continue
      for (const item of items) {
        // 변수명이 비면 poolFallback 필드(예: 항목명)로 대체 → 항목당 식별자 1개.
        let v = item?.[sub.name]
        if (!(typeof v === 'string' && v.trim()) && sub.poolFallback) v = item?.[sub.poolFallback]
        if (typeof v === 'string' && v.trim()) pool.push(v.trim())
      }
    }
  }
  return Array.from(new Set(pool))
}

// showWhen 조건으로 필드 표시 여부 판단. siblingValues = 같은 그룹 아이템 값.
export function shouldShowField(field, siblingValues) {
  const cond = field?.showWhen
  if (!cond) return true
  const current = siblingValues?.[cond.field]
  if (Object.prototype.hasOwnProperty.call(cond, 'is')) return current === cond.is
  if (Object.prototype.hasOwnProperty.call(cond, 'isNot')) return current !== cond.isNot
  return true
}

// select/multi_select 옵션 계산. {value,label}[] 반환.
export function resolveOptions(field, sharedPool) {
  let values = []
  if (field.optionsSource === SHARED_VARIABLE_POOL) {
    values = [...(sharedPool || [])]
  } else if (Array.isArray(field.options)) {
    values = [...field.options]
  }
  if (field.allowCustom && field.customLabel && !values.includes(field.customLabel)) {
    values.push(field.customLabel)
  }
  return values.map((v) => ({ value: v, label: v }))
}

// group_list 빈 아이템 생성(하위 필드 기본값)
export function makeEmptyItem(field) {
  const item = {}
  for (const sub of field.fields || []) {
    item[sub.name] = sub.type === TEMPLATE_FIELD_TYPES.MULTI_SELECT ? [] : ''
  }
  return item
}

// 레퍼런스 선택(구조 시드) 시에도 생성에 반영되는 시나리오 필드 — 나머지는 레퍼런스 구조가 이겨 무시된다.
// (생성기 applyScenarioSeeds v1 경계와 짝: 진입 발화만 설문 값 적용, AI 자유응답은 시드 후에도 부착)
export const SEED_ACTIVE_FIELDS = new Set(['시나리오 이름', '진입 발화', 'AI 자유응답 사용', 'AI 지식소스'])
export const isSeedIgnoredField = (fieldName, scenario) =>
  Boolean(String(scenario?.['레퍼런스 선택'] || '').trim()) && !SEED_ACTIVE_FIELDS.has(fieldName)

// 시나리오 배열 필수 검증. 실패 시 메시지(string), 통과 시 null.
export function validateScenarios(scenarios, template) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return '최소 하나의 시나리오를 추가해주세요'
  }
  for (const scenario of scenarios) {
    for (const field of template?.fields || []) {
      // 레퍼런스 선택 시 무시되는 필드는 비활성화되므로 검증도 건너뛴다.
      if (isSeedIgnoredField(field.name, scenario)) continue
      // '외부 연동'은 전용 에디터(ApiIntegrationField)가 검증한다 — validateApiIntegrations 참고.
      if (field.name === '외부 연동') continue
      // 단계가 있으면 '분기'는 단계 검증(validateSteps)이 맡는다 — 갈래 하위 흐름이면 한 줄 행동이 선택이라서.
      if (isStepValidatedField(field.name, scenario)) continue
      if (field.type === TEMPLATE_FIELD_TYPES.GROUP_LIST) {
        const items = Array.isArray(scenario?.[field.name]) ? scenario[field.name] : []
        for (const item of items) {
          for (const sub of field.fields || []) {
            if (!shouldShowField(sub, item)) continue
            if (sub.required && isEmpty(item?.[sub.name])) {
              return `'${field.name}'의 필수 항목 '${sub.name}'을(를) 채워주세요`
            }
            // 형식 검증(데이터-구동): 값이 있을 때만 적용. 예: 변수명 영문 규칙.
            const validator = sub.validate && FIELD_VALIDATORS[sub.validate]
            if (validator) {
              const msg = validator(item?.[sub.name])
              if (msg) return msg
            }
          }
        }
      } else if (field.required && isEmpty(scenario?.[field.name])) {
        return `시나리오의 필수 항목 '${field.name}'을(를) 채워주세요`
      }
    }
  }
  return null
}

// 식별자(영문 이름) 공용 검증. 비우면 허용. 한글·특수문자·띄어쓰기 차단(영문·숫자·밑줄만).
// 실패 시 사유 문자열, 통과 시 null. label은 메시지 머리말.
function nameRuleError(name, label) {
  const s = String(name || '').trim()
  if (!s) return null
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s)) return `${label}에 한글은 사용할 수 없어요 (영문으로 입력해 주세요)`
  if (!/^[A-Za-z0-9_]+$/.test(s)) return `${label}에는 특수문자·띄어쓰기를 사용할 수 없어요 (영문·숫자·밑줄만)`
  return null
}

// API 이름(직접입력) 검증. 비우면 허용(LLM이 생성).
export const apiNameError = (name) => nameRuleError(name, 'API 이름')
// 수집 정보 변수명 검증. 비우면 허용(LLM이 항목명에서 생성).
export const variableNameError = (name) => nameRuleError(name, '변수명')

// 템플릿 필드의 `validate` 키 → 검증 함수 매핑(데이터-구동). 폼 인라인 표시·진행 차단에서 공용.
export const FIELD_VALIDATORS = { variableName: variableNameError }

// 외부연동 검증: API 연동은 ①연동 목적 필수 ②직접입력이면 엔드포인트 필수 ③API 이름 규칙 ④반드시 테스트 통과(_tested).
// 실패 시 { message, scenarioIndex, integrationIndex }(문제 연동 위치 포함), 통과 시 null.
export function validateApiIntegrations(scenarios) {
  if (!Array.isArray(scenarios)) return null
  for (let sIdx = 0; sIdx < scenarios.length; sIdx++) {
    // 레퍼런스 선택(구조 시드) 시나리오의 외부 연동은 무시되므로 검증도 건너뛴다.
    if (isSeedIgnoredField('외부 연동', scenarios[sIdx])) continue
    const exts = Array.isArray(scenarios[sIdx]?.['외부 연동']) ? scenarios[sIdx]['외부 연동'] : []
    for (let iIdx = 0; iIdx < exts.length; iIdx++) {
      const ext = exts[iIdx]
      if (!String(ext?.['연동 방식'] || '').includes('API')) continue
      const where = `시나리오 ${sIdx + 1}의 외부 연동 ${iIdx + 1}: `
      const fail = (reason) => ({ message: where + reason, scenarioIndex: sIdx, integrationIndex: iIdx })
      if (isEmpty(ext?.['연동 목적'])) return fail('\'연동 목적\'을 입력해 주세요')
      const sel = ext?.['사용할 API']
      const isNew = !sel || sel === '새로 입력'
      if (isNew && isEmpty(ext?.['엔드포인트 URL'])) return fail('엔드포인트 URL을 입력하거나 등록된 API를 선택해 주세요')
      if (isNew) {
        const nameMsg = apiNameError(ext?.['API 이름'])
        if (nameMsg) return fail(nameMsg)
      }
      if (!ext?._tested) return fail('\'API 테스트\'를 통과해야 시나리오를 생성할 수 있어요')
    }
  }
  return null
}

function isEmpty(v) {
  if (v == null) return true
  if (typeof v === 'string') return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  return false
}

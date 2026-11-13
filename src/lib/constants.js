// 시나리오 카테고리는 이 파일에 두지 않는다 — 엣지 함수도 같은 목록을 쓰는데 이 파일은
// 최상단에서 import.meta.env를 읽어 Deno에서 로드조차 되지 않는다. 목록의 유일 소스는
// scenarioCategories.js이고, 프론트가 쓰는 이름을 지키기 위해 여기서 re-export만 한다.
export { SCENARIO_CATEGORIES } from './scenarioCategories.js'

// 솔루션 규칙 카테고리도 같은 이유로 별 모듈(solutionRuleCategories.js)에 두고 여기서 re-export한다
// (import.meta.env를 읽는 이 파일과 달리 그 모듈은 Deno에서도 로드된다 — constants.test.js 참고).
export { SOLUTION_RULE_CATEGORIES, SOLUTION_RULE_DB_CATEGORIES } from './solutionRuleCategories.js'

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

// DEV 테이블 모드: VITE_DEV_TABLES=true(.env.local)면 dev 지원 함수(-dev 슬러그)를 호출해
// dev_questions/dev_solution_rules/dev_dialogflow_results에서 실행한다 — 프로덕션 테이블 무접촉.
// 검증 후 dev 행을 본 테이블로 머지하는 워크플로우용. 나머지 함수는 dev 슬러그가 없어 공용.
export const DEV_TABLES = import.meta.env.VITE_DEV_TABLES === 'true'
const devable = (name) => `${API_BASE}/${name}${DEV_TABLES ? '-dev' : ''}`

export const API_ENDPOINTS = {
  QUESTIONS: `${API_BASE}/questions`,
  ADMIN_QUESTIONS: devable('admin-questions'),
  ADMIN_REFERENCES: `${API_BASE}/admin-references`,
  ADMIN_TEMPLATES: `${API_BASE}/admin-templates`,
  ADMIN_SOLUTION_RULES: devable('admin-solution-rules'),
  ADMIN_RULE_TEMPLATES: `${API_BASE}/admin-rule-templates`,
  ADMIN_RULE_FIELD_DEFINITIONS: `${API_BASE}/admin-rule-field-definitions`,
  ADMIN_RULE_VALUE_GENERATORS: `${API_BASE}/admin-rule-value-generators`,
  LEARN_RULES: `${API_BASE}/learn-rules`,
  LEARN_SOLUTION_RULES: `${API_BASE}/learn-solution-rules`,
  POC_DOC_PARSE: devable('poc-doc-parse'),
  DIALOGFLOW_GENERATOR: devable('dialogflow-generator'),
  RESULTS: devable('results'),
  RESULT_DETAIL: (id) => `${devable('results')}?id=${id}`,
  DERIVE_ASSETS: devable('derive-assets'),
  ADMIN_RESULTS: devable('admin-results'),
  ADMIN_RESULT_DETAIL: (id) => `${devable('admin-results')}?id=${id}`,
  ADMIN_TESTERS: `${API_BASE}/admin-testers`,
  TEMPLATE_DETAIL: (id) => `${API_BASE}/admin-templates?id=${id}`,
  FEEDBACK: devable('feedback'),
  SCENARIO_REFERENCES: devable('scenario-references'),
  SCENARIO_ASSETS: devable('scenario-assets'),
  API_REFERENCES: `${API_BASE}/api-references`,
  NL_SCENARIO_PARSE: devable('nl-scenario-parse'),
  NLP_BUILD: devable('nlp-build'),
  RESULT_EDIT_PARSE: devable('result-edit-parse'),
  API_DOC_PARSE: devable('api-doc-parse'),
  INGEST_CLASSIFY: devable('ingest-classify'),
  TRUSTED_DEVICE: `${API_BASE}/trusted-device`
}

export const INPUT_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  SELECT: 'select',
  STRUCTURED: 'structured',
  TEMPLATED: 'templated'
}

export const STRUCTURED_FIELD_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea'
}

export const TEMPLATE_FIELD_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  SELECT: 'select',
  MULTI_SELECT: 'multi_select',
  GROUP_LIST: 'group_list'
}

export const QUESTION_ROLES = {
  REQUIRED_CONTEXT: 'required_context',      // Essential information (must provide)
  OPTIONAL_CONTEXT: 'optional_context',      // Additional information (optional)
  CONSTRAINT: 'constraint',                  // Rules/requirements to follow
  INTENT: 'intent',                          // User's purpose or intention
  PREFERENCE: 'preference'                   // Optional settings/preferences
}

export const QUESTION_ROLE_LABELS = {
  required_context: '필수 정보',
  optional_context: '추가 정보',
  constraint: '제약조건',
  intent: '사용 의도',
  preference: '선택사항'
}

export const QUESTION_ROLE_DESCRIPTIONS = {
  required_context: '반드시 입력해야 하는 필수 정보',
  optional_context: '선택적으로 제공할 수 있는 추가 정보',
  constraint: '생성 시 반드시 지켜야 할 규칙이나 제약조건',
  intent: '사용자의 의도나 목적',
  preference: '선택적 설정이나 선호도'
}

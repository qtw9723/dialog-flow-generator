// 솔루션 규칙 카테고리 목록 — **이 목록의 유일 소스**.
//
// 왜 `constants.js`가 아니라 별 모듈인가: `constants.js`는 최상단에서 `import.meta.env`를 읽는데
// Deno에는 `import.meta.env`가 없어 **모듈 로드 시점에 TypeError로 죽는다**(scenarioCategories.js와
// 동일한 사유·실측 확인). 드리프트 방지 테스트(`constants.test.js`)가 이 목록을 엣지 함수의
// `_shared/solutionRuleCategories.ts`와 대조하려면 Deno에서 로드 가능해야 하므로, `import.meta`를
// 전혀 쓰지 않는 이 파일에 목록을 두고 `constants.js`는 여기서 re-export한다
// (프론트의 이름 `SOLUTION_RULE_CATEGORIES`/`SOLUTION_RULE_DB_CATEGORIES`는 그대로 유지된다).
//
// id=UI 식별자, label=표시명, dbName=solution_rules.category 값.
// 컨텍스트 로딩/리페치, 매니저 UI, Edge Function 검증이 모두 이 목록의 dbName으로 일치해야 한다.
//
// ⚠ 새 카테고리를 추가할 때 함께 고쳐야 하는 곳: 이 파일 + DB CHECK 제약(마이그레이션) +
// `supabase/functions/_shared/solutionRuleCategories.ts`의 `VALID_CATEGORIES`/`categoryDescriptions`.
export const SOLUTION_RULE_CATEGORIES = [
  { id: 'solution_rules', label: '솔루션 규칙', dbName: 'Solution Rule' },
  { id: 'system_variables', label: '시스템 변수', dbName: 'System Variable' },
  { id: 'node_usage_rules', label: '노드 사용 규칙', dbName: 'Node Usage Rule' },
  { id: 'variable_usage_rules', label: '변수 사용 규칙', dbName: 'Variable Usage Rule' },
  { id: 'value_generation_rules', label: '값 생성 규칙', dbName: 'Value Generation Rule' },
  { id: 'output_message_rules', label: '출력 멘트 규칙', dbName: 'Output Message Rule' },
  { id: 'condition_rules', label: '조건 규칙', dbName: 'Condition Rule' },
  { id: 'loop_rules', label: '루프 규칙', dbName: 'Loop Rule' },
  { id: 'nlp_function_reference', label: 'NLP 함수 규약', dbName: 'NLP Function Reference' },
  { id: 'document_term_mapping', label: '문서 용어 사전', dbName: 'Document Term Mapping' }
]

export const SOLUTION_RULE_DB_CATEGORIES = SOLUTION_RULE_CATEGORIES.map((category) => category.dbName)

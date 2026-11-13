// generation_tiers 번들 계약 (순수 데이터).
//
// 설계: docs/superpowers/specs/2026-08-31-generation-tiers-bundle-contract-design.md
// 등급 — required: 그 프로파일이면 항상 있다 / optional: 기능이 켜졌을 때만 /
//        observability: UI가 읽지 않는다(SQL 조회 전용).
// legacy: 이 키의 옛 이름. readBundle이 순서대로 찾아 채운다.
// default: 없을 때 읽기 쪽이 보는 값. **쓰기 쪽은 기본값을 저장하지 않는다**(행을 부풀리지 않음).

export const BUNDLE_CONTRACT = {
  // ── required (생성 결과) ─────────────────────────────────────────────
  flow: { tier: 'required', desc: 'designFlow가 만든 FlowSpec 본문 전체', default: null },
  design_stats: {
    tier: 'required', legacy: ['stage1_flow'], default: null,
    desc: 'designFlow 통계 {node_count, llm_calls, repaired, reprompted}',
  },
  usage: { tier: 'required', desc: '전 스테이지 LLM 토큰 사용량·예상 비용·소요 시간', default: null },
  created_by: { tier: 'required', desc: '생성한 테스터의 로그인 이메일', default: '' },

  // ── required (업로드 봇) ─────────────────────────────────────────────
  upload: { tier: 'required', desc: '업로드 봇 메타(파일명·sha256·노드 수·잠긴 수 등)', default: null },

  // ── optional ────────────────────────────────────────────────────────
  esd: { tier: 'optional', desc: '편집 가능한 ESD 번들(결과 상세에서 PATCH로 갱신)', default: null },
  esd_schemas: { tier: 'optional', desc: 'deriveEsdSchemas가 사후 파생한 ESD 스키마 배열', default: [] },
  esd_mapping: { tier: 'optional', desc: 'ESD 필드 ↔ 수집 변수 매핑표', default: null },
  esd_mapping_confirmed: { tier: 'observability', desc: '사용자가 확정한 ESD 매핑 원본 입력(2-pass, esd_mapping과 별도 기록)', default: null },
  api_defs: { tier: 'optional', desc: 'deriveApiDefs가 파생한 API 정의 배열', default: [] },
  nlp: { tier: 'optional', desc: 'NLP 학습 데이터 번들(인텐트·엔티티·어터런스)', default: null },
  scenarios: { tier: 'optional', desc: '루트 노드 id → 시나리오 표시 이름', default: null },
  source: { tier: 'optional', desc: "생성 경로 마커('survey'·'poc-doc'·'nl' 등)", default: null },
  edit_history: { tier: 'optional', desc: '편집 이력 스택(되돌리기용)', default: [] },
  validation: { tier: 'optional', desc: '생성 후 구조 검증 결과', default: null },
  confirmed_mapping: { tier: 'optional', desc: '사용자가 확정한 ESD 매핑(2-pass 모드)', default: null },
  archived: { tier: 'optional', desc: '사용자가 보관 표시한 결과(목록 필터용)', default: false },
  verification: { tier: 'optional', desc: "사용자가 '솔루션 검증 완료'로 표시한 기록 {status, at, flow_hash} — 없으면 미검증 초안, flow_hash가 현재 흐름과 다르면 검증 후 수정됨(v0.16.0)", default: null },
  assembly: { tier: 'optional', desc: '라이브러리 조립 출처(자산 id·경고) — 조립물 표식', default: null },

  // ── observability (UI 미소비) ───────────────────────────────────────
  esd_result_fields: { tier: 'observability', desc: '조회 ESD 스키마별 돌려받는 필드(멘트·스키마 파생 공용, 2026-10-14)', default: null },
  esd_result_unused: { tier: 'observability', desc: '결과를 어떤 멘트도 쓰지 않는 조회 노드(관측용)', default: null },
  esd_ref_unknown_keys: { tier: 'observability', desc: '조회 결과를 스키마에 없는 키로 참조한 멘트 목록(관측용)', default: null },
  design_ok: { tier: 'observability', legacy: ['tier1_learned'], desc: 'designFlow 성공 여부', default: null },
  expand_count: { tier: 'observability', legacy: ['tier2_structure_count'], desc: 'expandFlowWithSpecs 전개 횟수', default: null },
  field_definitions_loaded: { tier: 'observability', legacy: ['tier2_field_definitions_loaded'], desc: '로드한 필드 정의 수', default: null },
  values_filled: { tier: 'observability', legacy: ['tier25_values_filled'], desc: 'fillNodeValues가 채운 노드 수', default: null },
  rules_executed: { tier: 'observability', legacy: ['tier3_executed_rules'], desc: '실행된 규칙 배열', default: [] },
  rules_skipped: { tier: 'observability', legacy: ['tier3_skipped_rules'], desc: '건너뛴 규칙 배열', default: [] },
  feature_mapping: { tier: 'observability', legacy: ['tier3_feature_mapping'], desc: '(2026-06-16 7행에만 존재하는 사장 키)', default: null },
  loop_exit_normalized: { tier: 'observability', legacy: ['stage29_loop_exit_normalized'], desc: '루프 탈출 정규화', default: null },
  collection_loops: { tier: 'observability', legacy: ['stage295_collection_loops'], desc: '수집 루프 래핑', default: null },
  validation_loops: { tier: 'observability', legacy: ['stage3_validation_loops'], desc: '검증 루프 래핑', default: null },
  stripped_condition_nodes: { tier: 'observability', legacy: ['stage35_stripped_condition_nodes'], desc: '제거한 컨디션 노드', default: null },
  initialized_accumulators: { tier: 'observability', legacy: ['stage36_initialized_accumulators'], desc: '누산 변수 초기화', default: null },
  fallback_injected: { tier: 'observability', legacy: ['stage365_fallback'], desc: 'fallback 주입', default: null },
  llm_blocks: { tier: 'observability', legacy: ['stage37_llm_blocks'], desc: 'LLM 블록 적용', default: null },
  api_guard: { tier: 'observability', legacy: ['stage375_api_guard'], desc: 'API 가드', default: null },
  else_order_moved: { tier: 'observability', desc: 'normalizeElseOrder가 정렬한 분기 노드 id 배열', default: [] },
  consecutive_outputs_merged: { tier: 'observability', desc: 'mergeConsecutiveOutputs가 합친 연속 멘트 [{nodeId, mergedId}] — output 뒤 턴이 끝나 이어진 멘트가 입력을 한 번 더 요구하던 것(2026-10-26 솔루션 확인)', default: [] },
  shadowed_branches: { tier: 'observability', desc: 'findShadowedBranches가 찾은 가려진 갈래(빈 조건·true·중복 조건 뒤) — 화면은 현재 flow로 즉석 계산(v0.16.0)', default: [] },
  rules_snapshot: { tier: 'observability', desc: '규칙 세트 지문(Instruction Bleed 역추적)', default: null },
  scenario_examples: { tier: 'observability', desc: 'few-shot 주입 기록', default: null },
  stage368_scenario_seeds: { tier: 'observability', desc: 'applyScenarioSeeds가 시드한 시나리오 레퍼런스 구조 기록(선재 결함 수정, E)', default: null },
  nlp_error: { tier: 'optional', desc: 'NLP 파생 실패 사유 — 결과 상세의 독립 블록(결과 종류 무관)에 보인다', default: null },
  esd_error: { tier: 'optional', desc: 'ESD 스키마 파생 실패 사유 — 결과 상세의 독립 블록에 보인다', default: null },
  api_error: { tier: 'optional', desc: 'API 정의 파생 실패 사유 — 결과 상세의 독립 블록에 보인다', default: null },
  doc_coverage: { tier: 'optional', desc: '문서 추출 커버리지 — 어느 열이 무엇이 됐고 무엇이 버려졌는지. 결과 상세의 독립 블록에 보인다', default: null },
  scenario_name_mismatch: { tier: 'observability', desc: '입력 시나리오 이름과 어긋난 태깅 기록', default: null },
  scenario_name_resolution: { tier: 'observability', desc: '루트↔시나리오 대응 보강 경로별 건수', default: null },
  bundle_error: { tier: 'observability', desc: 'buildBundle 조립 실패 사유(계약 위반이 런타임을 죽이지 않게 한 폴백의 흔적)', default: null },
}

/** 프로파일별 필수 키. 업로드 봇은 생성기를 거치지 않아 flow·design_stats·usage가 없다.
 *  조립물(assembled)도 마찬가지고, assembly가 그 표식이다. */
export const PROFILE_REQUIRED = {
  generated: ['flow', 'design_stats', 'usage', 'created_by'],
  upload: ['upload'],
  assembled: ['assembly'],
}

/**
 * 폴백 없이 버리는 개수 키. 옆의 배열 키에서 길이로 복원되고, 타입이 달라(숫자 vs 배열)
 * legacy로 매핑하면 소비처가 깨진다.
 */
export const DROPPED_KEYS = ['tier3_rules_executed', 'tier3_rules_skipped', 'stage377_else_order_moved']

export const CANONICAL_KEYS = Object.keys(BUNDLE_CONTRACT)

export const LEGACY_TO_CANONICAL = Object.fromEntries(
  Object.entries(BUNDLE_CONTRACT).flatMap(([k, v]) => (v.legacy || []).map((old) => [old, k])),
)

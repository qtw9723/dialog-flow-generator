-- NLP 함수 규약(intent/intents/entity/entities) 참조용 카테고리 추가.
-- ⚠ 이 카테고리는 RULE_STAGE_BY_CATEGORY에 매핑하지 않는다 — 프롬프트 미주입, 어드민 참조 전용.
--    v0.8.1에서 조건 생성을 NLP 기준으로 전환할 때 스테이지를 연결한다.
ALTER TABLE solution_rules DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE solution_rules ADD CONSTRAINT valid_category CHECK (
  category = ANY (ARRAY[
    'Solution Rule',
    'System Variable',
    'Node Usage Rule',
    'Variable Usage Rule',
    'Value Generation Rule',
    'Output Message Rule',
    'Condition Rule',
    'Loop Rule',
    'NLP Function Reference'
  ])
);

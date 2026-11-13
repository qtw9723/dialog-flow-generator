-- 검증 재시도 루프(subflow) 기능: 'Loop Rule' 카테고리 추가 + 설정값 시드.
-- 래핑 로직은 코드(wrapValidationLoops, 결정론적 안전장치)에 있고, 튜너블 파라미터(최대 횟수·형식별 정규식·초과 행동)는
-- 이 행의 content(jsonb)에 두어 어드민/학습이 관리한다(resolveLoopRule가 파싱, 부재 시 코드 기본값 폴백).

-- 1) valid_category 제약에 'Loop Rule' 추가
ALTER TABLE solution_rules DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE solution_rules ADD CONSTRAINT valid_category CHECK (category IN (
  'Solution Rule',
  'System Variable',
  'Node Usage Rule',
  'Variable Usage Rule',
  'Value Generation Rule',
  'Output Message Rule',
  'Condition Rule',
  'Loop Rule'
));

-- 2) Loop Rule 시드 (멱등: 같은 title 있으면 content 갱신)
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT
  'Loop Rule',
  '검증 재시도 루프 설정',
  '수집 정보 항목의 입력 형식이 검증 가능한 형식(formats에 정의된 라벨)일 때, 사용자가 형식에 맞게 입력할 때까지 최대 maxCount회 되묻는 subflow 루프로 자동 생성한다. formats는 입력형식 라벨→정규식(슬래시 제외) 매핑이다. onExhaust는 최대 횟수 초과 시 행동 설정값으로, 케이스별로 다를 수 있어 값만 보유한다(현재 기본 동작은 마지막 입력 저장 후 진행).',
  '{"maxCount":3,"formats":{"숫자":"^[0-9-]+$","날짜":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"onExhaust":"continue"}'::jsonb,
  10
WHERE NOT EXISTS (
  SELECT 1 FROM solution_rules WHERE category = 'Loop Rule' AND title = '검증 재시도 루프 설정'
);

UPDATE solution_rules
  SET content = '{"maxCount":3,"formats":{"숫자":"^[0-9-]+$","날짜":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"onExhaust":"continue"}'::jsonb,
      updated_at = now()
  WHERE category = 'Loop Rule' AND title = '검증 재시도 루프 설정';

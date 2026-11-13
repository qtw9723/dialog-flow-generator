-- 문서 용어 사전 카테고리 추가.
-- 추출 단계가 소비하는 사전이므로 RULE_STAGE_BY_CATEGORY에는 넣지 않는다.
ALTER TABLE solution_rules DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE solution_rules ADD CONSTRAINT valid_category CHECK (category IN (
  'Solution Rule','System Variable','Node Usage Rule','Variable Usage Rule',
  'Value Generation Rule','Output Message Rule','Condition Rule','Loop Rule',
  'NLP Function Reference','Document Term Mapping'
));

-- dev_ 테이블은 로컬 검증용이라 존재하지 않을 수 있으므로 있을 때만 적용한다.
DO $$
BEGIN
  IF to_regclass('public.dev_solution_rules') IS NOT NULL THEN
    ALTER TABLE dev_solution_rules DROP CONSTRAINT IF EXISTS valid_category;
    ALTER TABLE dev_solution_rules ADD CONSTRAINT valid_category CHECK (category IN (
      'Solution Rule','System Variable','Node Usage Rule','Variable Usage Rule',
      'Value Generation Rule','Output Message Rule','Condition Rule','Loop Rule',
      'NLP Function Reference','Document Term Mapping'
    ));
  END IF;
END $$;

-- 시드: 지금 parseDocResponse.ts 프롬프트에 하드코딩된 대응표를 그대로 옮긴다.
-- title은 field와 같아야 한다 — 학습 쓰기(Task 6)가 title로 행을 찾는다.
-- content.key는 추출 응답 스키마의 영문 키다. 제거된 하드코딩 표가 `시나리오 이름(name)`처럼
-- 키를 명시했으므로, 한글 라벨만 남기면 LLM이 라벨과 응답 스키마 키를 잇지 못한다.
--
-- ⚠ 반드시 멱등하게 쓴다(이 저장소 시드 관례: INSERT ... SELECT ... WHERE NOT EXISTS).
--    재적용·부분 적용 재시도로 같은 (category,title) 행이 둘이 되면, 학습 쓰기의
--    planLearnWrites는 첫 행만 보는데 index.ts의 UPDATE는 .eq("title", …)로 두 행을 모두
--    덮어써 둘째 행의 학습 용어가 소리 없이 사라지고, renderLayoutGuide는 같은 필드를 두 줄씩 뱉는다.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT v.category, v.title, v.description, v.content, v.order_index
FROM (VALUES
  ('Document Term Mapping','시나리오 이름','문서에서 시나리오 이름에 해당하는 열 이름',
   '{"field":"시나리오 이름","key":"name","terms":["시나리오","Usecase","Case","유스케이스","기능명"],"source":"seed"}'::jsonb, 1),
  ('Document Term Mapping','진입 발화','문서에서 진입 발화에 해당하는 열 이름',
   '{"field":"진입 발화","key":"trigger","terms":["질의","발화 예시","사용자 발화","In","Intent"],"source":"seed"}'::jsonb, 2),
  ('Document Term Mapping','수집 정보','문서에서 수집 항목에 해당하는 열 이름',
   '{"field":"수집 정보","key":"collect","terms":["Entity","Request Data","수집 정보","입력값"],"source":"seed"}'::jsonb, 3),
  ('Document Term Mapping','완료 시 결과','문서에서 완료 결과에 해당하는 열 이름',
   '{"field":"완료 시 결과","key":"done","terms":["응답","Respond Data","처리 결과","Out"],"source":"seed"}'::jsonb, 4),
  ('Document Term Mapping','분기','문서에서 분기에 해당하는 열 이름',
   '{"field":"분기","key":"branches","terms":["분기","조건","비고"],"source":"seed"}'::jsonb, 5),
  -- 외부 연동: 드롭다운(MAPPABLE_FIELDS)에는 있는데 시드 행이 없어, 사용자가 이 필드를 골라도
  -- 학습 대상 행이 없어(planLearnWrites의 'no-row') 항상 버려졌다. 행을 만들어 다리를 잇는다.
  ('Document Term Mapping','외부 연동','문서에서 외부 연동(API·ESD 호출)에 해당하는 열 이름',
   '{"field":"외부 연동","key":"integrations","terms":["API","연동","외부 연동","Integration"],"source":"seed"}'::jsonb, 6)
) AS v(category, title, description, content, order_index)
WHERE NOT EXISTS (
  SELECT 1 FROM solution_rules r WHERE r.category = v.category AND r.title = v.title
);

-- 이미 들어가 있는 행에는 content.key만 병합한다(terms·userTerms 등 학습 결과는 건드리지 않는다).
UPDATE solution_rules r
SET content = r.content || jsonb_build_object('key', v.key), updated_at = now()
FROM (VALUES
  ('시나리오 이름','name'), ('진입 발화','trigger'), ('수집 정보','collect'),
  ('완료 시 결과','done'), ('분기','branches'), ('외부 연동','integrations')
) AS v(title, key)
WHERE r.category = 'Document Term Mapping' AND r.title = v.title
  AND r.content->>'key' IS DISTINCT FROM v.key;

-- dev 사본도 같은 이유로 멱등해야 한다.
DO $$
BEGIN
  IF to_regclass('public.dev_solution_rules') IS NOT NULL THEN
    INSERT INTO dev_solution_rules (category, title, description, content, order_index)
      SELECT s.category, s.title, s.description, s.content, s.order_index
      FROM solution_rules s
      WHERE s.category = 'Document Term Mapping'
        AND NOT EXISTS (
          SELECT 1 FROM dev_solution_rules d
          WHERE d.category = s.category AND d.title = s.title
        );

    UPDATE dev_solution_rules d
    SET content = d.content || jsonb_build_object('key', v.key), updated_at = now()
    FROM (VALUES
      ('시나리오 이름','name'), ('진입 발화','trigger'), ('수집 정보','collect'),
      ('완료 시 결과','done'), ('분기','branches'), ('외부 연동','integrations')
    ) AS v(title, key)
    WHERE d.category = 'Document Term Mapping' AND d.title = v.title
      AND d.content->>'key' IS DISTINCT FROM v.key;
  END IF;
END $$;

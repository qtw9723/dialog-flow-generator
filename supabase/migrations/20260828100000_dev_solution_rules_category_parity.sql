-- dev_solution_rules의 valid_category 제약을 프로덕션과 동일하게 맞춘다.
--
-- 배경: dev_ 테이블은 `CREATE TABLE dev_X (LIKE X INCLUDING ALL)`로 만들어 CHECK 제약까지 복사된다.
-- 20260827180000이 solution_rules 쪽만 넓혀서 dev_solution_rules는 8개 카테고리에 머물렀고,
-- 어드민 -dev로 'NLP Function Reference' 규칙을 넣으면 500(check constraint 위반)이 났다.
-- 다음 사이클의 dev 재시드(INSERT ... SELECT * FROM solution_rules)도 같은 이유로 실패한다.
--
-- dev_ 테이블은 로컬 검증용이라 존재하지 않을 수 있으므로 있을 때만 적용한다.
DO $$
BEGIN
  IF to_regclass('public.dev_solution_rules') IS NOT NULL THEN
    ALTER TABLE dev_solution_rules DROP CONSTRAINT IF EXISTS valid_category;
    ALTER TABLE dev_solution_rules ADD CONSTRAINT valid_category CHECK (
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
  END IF;
END $$;

-- dev 환경 리셋 — "다음 버전 착수 시" 첫 단계의 DB 부분.
-- 실행 (둘 중 하나):
--   1) Supabase 대시보드 → SQL Editor에 통째로 붙여넣고 Run.
--   2) Management API로 직접 — CLI에는 임의 SQL 실행 명령이 없지만, `supabase login` 토큰이
--      macOS 키체인(service "Supabase CLI", account "supabase")에 `go-keyring-base64:` 접두사로
--      들어 있다. base64를 벗겨 Bearer로 쓰면 된다:
--        POST https://api.supabase.com/v1/projects/<ref>/database/query
--        {"query": "..."}   (User-Agent를 curl로 둘 것)
--      ⚠ 토큰을 파일에 남기지 말 것 — 읽어서 바로 쓰고 버린다.
--
-- ⚠ 이 내용은 dev 전용이라 마이그레이션으로 두면 안 된다 — 마이그레이션 파일은 프로덕션 본 테이블에도 적용된다.
--
-- ⚠ 이 파일이 dev 테이블 목록의 단일 소스다. 새 dev_ 테이블을 만들면 여기에도 추가할 것.
--   (v0.10.0에서 dev_dialogflow_scenario_assets가 CLAUDE.md 산문 목록에서 누락된 전례가 있다.)
--
-- 절차·이유는 CLAUDE.md "다음 버전 착수 시 — dev 환경 리셋·재세팅" 참조.

-- 1. 질문·규칙: 프로덕션 미러로 재시드.
--    ⚠ id는 재발급되지 않는다 — `INSERT ... SELECT *`가 id 컬럼을 그대로 복사한다
--      (2026-09-15 실측: 리셋 전 dev↔프로덕션 id가 questions 9/9 · solution_rules 39/39 일치).
--    ⚠ 이미 내용이 동일하면 이 두 블록은 순수 no-op이다. 먼저 해시로 대조하고 다른 것만 돌리면
--      불필요한 파괴를 피할 수 있다:
--        select md5(string_agg(t::text,'|' order by id::text)) from questions t;   -- dev_ 쪽과 비교
TRUNCATE dev_questions;
INSERT INTO dev_questions SELECT * FROM questions;

TRUNCATE dev_solution_rules;
INSERT INTO dev_solution_rules SELECT * FROM solution_rules;

-- 2. 테스트 생성 결과: 비운다(프로덕션에서 옮겨올 것이 없다 — dev에서 만든 연습물뿐).
TRUNCATE dev_dialogflow_results;

-- 3. 사용자 자산 라이브러리(v0.10.0 신설): 프로덕션 미러.
--    프로덕션이 비어 있으면 결과적으로 비우기와 같다.
TRUNCATE dev_dialogflow_scenario_assets;
INSERT INTO dev_dialogflow_scenario_assets SELECT * FROM dialogflow_scenario_assets;

-- 4. 시나리오 레퍼런스: 승격분만 미러 갱신, **dev-only 행은 보존**.
--    dev가 유일 소스인 미승격 레퍼런스가 있으므로 TRUNCATE 금지.
DELETE FROM dev_dialogflow_scenario_references
 WHERE id IN (SELECT id FROM dialogflow_scenario_references);
INSERT INTO dev_dialogflow_scenario_references
SELECT * FROM dialogflow_scenario_references;

-- 5. 피드백: 컬럼을 명시한다(스키마가 한쪽만 앞서가는 기간 대비).
TRUNCATE dev_dialogflow_feedback;
INSERT INTO dev_dialogflow_feedback
  (id, name, content, completed, created_at, updated_at, screenshot_path)
SELECT id, name, content, completed, created_at, updated_at, screenshot_path
  FROM dialogflow_feedback;

-- 6. 검증 — 보존분(레퍼런스 dev-only)을 뺀 나머지는 dev와 본 테이블 행 수가 같아야 한다.
SELECT 'questions'                    AS t, (SELECT count(*) FROM questions)                    AS prod, (SELECT count(*) FROM dev_questions)                    AS dev
UNION ALL SELECT 'solution_rules',          (SELECT count(*) FROM solution_rules),                    (SELECT count(*) FROM dev_solution_rules)
UNION ALL SELECT 'dialogflow_scenario_assets', (SELECT count(*) FROM dialogflow_scenario_assets),     (SELECT count(*) FROM dev_dialogflow_scenario_assets)
UNION ALL SELECT 'dialogflow_feedback',     (SELECT count(*) FROM dialogflow_feedback),               (SELECT count(*) FROM dev_dialogflow_feedback)
UNION ALL SELECT 'dialogflow_results (dev는 0이어야 정상)', (SELECT count(*) FROM dialogflow_results), (SELECT count(*) FROM dev_dialogflow_results)
UNION ALL SELECT 'scenario_references (dev >= prod: 미승격분 보존)', (SELECT count(*) FROM dialogflow_scenario_references), (SELECT count(*) FROM dev_dialogflow_scenario_references);

-- 7. 스토리지는 SQL로 지울 수 없다 — 버킷 feedback-screenshots의 `dev/` 접두사 객체는
--    Storage API 또는 대시보드에서 별도로 비운다(프로덕션은 `prod/` 접두사이므로 무접촉).

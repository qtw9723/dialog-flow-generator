-- 2026-10-14: ESD 조회 결과 멘트 활용 — 규칙 보강(문구는 DB, CLAUDE.md 규약).
-- 실측: resultFields를 멘트 변수 목록에 실은 뒤에도 조회 5개 중 3개는 멘트가 조회 결과 대신
-- 사용자가 방금 입력한 조회 조건(${local.cdt} 등)을 되읊었다. 기존 규칙 4025055b에 우선순위를 한 줄 덧붙인다.
-- 설계: docs/superpowers/specs/2026-10-14-esd-lookup-result-fields-design.md
-- 멱등: 이미 덧붙었으면 no-op.
UPDATE solution_rules
SET description = description || ' 직전에 조회(API·ESD)가 있으면, 사용자가 방금 입력한 값(조회 조건)을 되읊는 대신 그 조회 결과변수의 필드를 우선 보여준다 — 입력값은 사용자가 이미 아는 값이다.'
WHERE id = '4025055b-3e33-40b1-87c2-fa4350092582'
  AND description NOT LIKE '%조회 조건)을 되읊는 대신%';

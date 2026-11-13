-- 레거시 값-할당 테이블 제거 (필드 스키마 / 조건 패턴 / 값 할당)
--
-- 배경: 이 세 테이블은 2026-05-27 "동적 JSON 규칙 시스템"의 잔재로,
--       현재 생성 경로(designFlow→expandFlowWithSpecs)에서 미사용.
--       2026-06-17 기준 프로덕션 3개 테이블 모두 0행 확인.
--
-- ⚠️ 적용 정책: 공유 프로덕션 DB이므로 `supabase db push`로 적용하지 말 것.
--    승인 후 Management API(.env의 SUPABASE_ACCESS_TOKEN)로 멱등 적용한다.
--    (mailer 마이그레이션 divergence 정책과 동일 기조.)

DROP TABLE IF EXISTS public.field_value_mappings;
DROP TABLE IF EXISTS public.field_schemas;
DROP TABLE IF EXISTS public.condition_patterns;

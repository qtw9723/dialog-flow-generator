-- 전역 질문 시드: 말투(preference), 금지사항(constraint)
-- order_index는 기존 산업군(1) 뒤로 배치. A1(정체성)은 미포함 — 적용 전 별도 확정.
-- NOTE: questions.options 컬럼은 text[] 타입이다. jsonb 캐스팅(::jsonb)은 fresh DB
--       db push 시 "type text[] but expression is of type jsonb" 에러를 낸다 → text[] 리터럴 사용.
INSERT INTO public.questions (text, input_type, is_required, options, order_index, question_role)
SELECT '봇의 말투를 골라주세요', 'select', true,
       ARRAY['정중한 격식체','친근한 존댓말','전문가·간결','밝고 캐주얼']::text[], 2, 'preference'
WHERE NOT EXISTS (SELECT 1 FROM public.questions WHERE text = '봇의 말투를 골라주세요');

INSERT INTO public.questions (text, input_type, is_required, options, order_index, question_role)
SELECT '봇이 절대 하면 안 되는 말이나 행동이 있나요? (한 줄에 하나)', 'textarea', false,
       ARRAY[]::text[], 3, 'constraint'
WHERE NOT EXISTS (SELECT 1 FROM public.questions WHERE text LIKE '봇이 절대 하면 안 되는%');

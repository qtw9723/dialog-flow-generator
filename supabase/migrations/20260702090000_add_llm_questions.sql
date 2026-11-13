-- AI 자유응답(LLM) 질문 2행 추가 (v0.2.0 — llmchat 블록 트리거).
-- 생성기는 질문 텍스트 접두사 'AI 자유응답'으로 답변을 감지한다(applyLlmBlocks.QUESTION_PREFIX).
-- 접두사를 바꾸면 감지가 끊긴다. options 컬럼은 text[] (jsonb 캐스팅 금지 — 20260616120000 참고).
INSERT INTO public.questions (text, input_type, is_required, options, order_index, question_role)
SELECT 'AI 자유응답(LLM) 사용 — 정해진 시나리오 외 질문을 AI가 자유롭게 답해요. 어디에 넣을까요?',
       'select', false,
       ARRAY['사용 안 함','메뉴 항목으로 추가','기타 질문 응대(폴백)','둘 다']::text[],
       (SELECT COALESCE(MAX(order_index), 0) + 1 FROM public.questions),
       'preference'
WHERE NOT EXISTS (SELECT 1 FROM public.questions WHERE text LIKE 'AI 자유응답(LLM) 사용%');

INSERT INTO public.questions (text, input_type, is_required, options, order_index, question_role)
SELECT 'AI 자유응답 주제 — AI가 어떤 주제를 답하면 되나요? (선택, 한 줄. 비우면 봇 소개로 대체)',
       'text', false, ARRAY[]::text[],
       (SELECT COALESCE(MAX(order_index), 0) + 1 FROM public.questions),
       'optional_context'
WHERE NOT EXISTS (SELECT 1 FROM public.questions WHERE text LIKE 'AI 자유응답 주제%');

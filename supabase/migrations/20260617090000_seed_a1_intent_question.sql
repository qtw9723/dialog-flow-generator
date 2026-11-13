-- A1: 봇 정체성+성공조건 질문 (intent). 설문 맨 앞에 배치.
-- 논리적 순서: A1(0) → 산업군(1) → 말투(2) → 시나리오 입력(3) → 금지사항(4)
INSERT INTO public.questions (text, input_type, is_required, options, order_index, question_role)
SELECT '이 봇은 누구를 위해 어떤 일을 하며, 대화가 끝났을 때 무엇이 이뤄져 있어야 하나요?', 'textarea', true,
       ARRAY[]::text[], 0, 'intent'
WHERE NOT EXISTS (SELECT 1 FROM public.questions WHERE text LIKE '이 봇은 누구를 위해%');

-- 기존 질문 재배치 (멱등)
UPDATE public.questions SET order_index = 1 WHERE text = '산업군을 선택해 주세요.';
UPDATE public.questions SET order_index = 2 WHERE text = '봇의 말투를 골라주세요';
UPDATE public.questions SET order_index = 3 WHERE text = '시나리오 입력';
UPDATE public.questions SET order_index = 4 WHERE text LIKE '봇이 절대 하면 안 되는%';

-- 라이브 적용(2026-06-17): 배포된 admin-questions 엣지 함수로 멱등 적용.

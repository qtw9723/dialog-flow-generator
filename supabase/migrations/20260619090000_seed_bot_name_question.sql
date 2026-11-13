-- 챗봇 이름 문항(결과 식별용)을 설문 맨 앞에 추가하고 기존 문항을 한 칸씩 뒤로.
-- options 컬럼은 text[]이므로 ARRAY[]::text[] 사용(빈 옵션).
INSERT INTO public.questions (text, input_type, is_required, options, order_index, question_role)
SELECT '챗봇 이름을 정해주세요', 'text', true, ARRAY[]::text[], 0, 'required_context'
WHERE NOT EXISTS (SELECT 1 FROM public.questions WHERE text = '챗봇 이름을 정해주세요');

-- 기존 문항 재배치 (멱등)
UPDATE public.questions SET order_index = 1 WHERE text LIKE '이 봇은 누구를 위해%';
UPDATE public.questions SET order_index = 2 WHERE text = '산업군을 선택해 주세요.';
UPDATE public.questions SET order_index = 3 WHERE text = '봇의 말투를 골라주세요';
UPDATE public.questions SET order_index = 4 WHERE text = '시나리오 입력';
UPDATE public.questions SET order_index = 5 WHERE text LIKE '봇이 절대 하면 안 되는%';

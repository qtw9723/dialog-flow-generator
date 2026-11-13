-- 시나리오 템플릿 시드 (group_list 중첩 필드)
INSERT INTO public.templates (name, description, fields)
SELECT '대화 시나리오', '대화 갈래 하나를 기술하는 시나리오 템플릿',
'[
  {"name":"시나리오 이름","type":"text","required":true},
  {"name":"진입 발화","type":"textarea","required":true},
  {"name":"수집 정보","type":"group_list","required":false,"fields":[
    {"name":"항목명","type":"text","required":true,"contributesToPool":true},
    {"name":"필수 여부","type":"select","required":true,"options":["필수","선택"]},
    {"name":"입력 형식","type":"select","required":true,"options":["자유텍스트","숫자","날짜","기타"]},
    {"name":"없을 때 되묻는 말","type":"textarea","required":false}
  ]},
  {"name":"분기","type":"group_list","required":false,"fields":[
    {"name":"조건 대상","type":"select","required":true,"optionsSource":"sharedVariablePool","allowCustom":true,"customLabel":"직접 입력"},
    {"name":"연산자","type":"select","required":false,"options":["같음","포함","패턴일치"],"showWhen":{"field":"조건 대상","isNot":"직접 입력"}},
    {"name":"값","type":"text","required":false,"showWhen":{"field":"조건 대상","isNot":"직접 입력"}},
    {"name":"직접 입력 조건","type":"textarea","required":false,"showWhen":{"field":"조건 대상","is":"직접 입력"}},
    {"name":"그 경우 봇의 행동","type":"textarea","required":true}
  ]},
  {"name":"외부 연동","type":"group_list","required":false,"fields":[
    {"name":"연동 방식","type":"select","required":true,"options":["외부 시스템 호출 (API)","내부 데이터 저장·조회 (ESD)"]},
    {"name":"연동 목적","type":"text","required":true},
    {"name":"보낼 정보","type":"multi_select","required":false,"optionsSource":"sharedVariablePool","allowCustom":true,"customLabel":"직접 입력"},
    {"name":"결과를 담을 이름","type":"text","required":true,"contributesToPool":true}
  ]},
  {"name":"완료 시 결과","type":"textarea","required":true},
  {"name":"상담사 연결 조건","type":"textarea","required":false}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.templates WHERE name = '대화 시나리오');

-- 기존 "시나리오 입력" 질문을 이 템플릿에 (재)연결.
-- 주의: 라이브 DB에서 이 질문의 template_id는 NULL이 아니라 '존재하지 않는 템플릿'을 가리키는
--       고아 링크였음(RLS로 anon SELECT엔 templates가 비어 보였을 뿐 실제로는 행 존재).
--       따라서 NULL뿐 아니라 다른 값을 가리키는 경우에도 재연결되도록 IS DISTINCT FROM 사용.
UPDATE public.questions
SET template_id = (SELECT id FROM public.templates WHERE name = '대화 시나리오')
WHERE text = '시나리오 입력'
  AND template_id IS DISTINCT FROM (SELECT id FROM public.templates WHERE name = '대화 시나리오');

-- 라이브 적용 기록(2026-06-16): 공유 프로덕션 DB에는 배포된 admin-templates/admin-questions
-- 엣지 함수로 멱등 적용함. 생성된 '대화 시나리오' 템플릿 id=4cb29fbf-67a4-46a2-a63a-c4173c016fa6,
-- 기존 '시나리오' 템플릿(id=087eb14a..., 평면 4필드)은 보존(비파괴).

-- '대화 시나리오' 외부연동(API)에 "파라미터 설명"(자연어) 추가 — 수집정보→API 파라미터 매핑을 LLM에 지시.
-- 멱등: 이미 있으면 건너뜀.
UPDATE public.templates
SET fields = '[
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
    {"name":"엔드포인트 URL","type":"text","required":true,"showWhen":{"field":"연동 방식","is":"외부 시스템 호출 (API)"}},
    {"name":"method","type":"select","required":true,"options":["GET","POST","PUT","DELETE","PATCH"],"showWhen":{"field":"연동 방식","is":"외부 시스템 호출 (API)"}},
    {"name":"헤더","type":"group_list","required":false,"showWhen":{"field":"연동 방식","is":"외부 시스템 호출 (API)"},"fields":[
      {"name":"key","type":"text","required":true},
      {"name":"value","type":"text","required":false}
    ]},
    {"name":"바디","type":"group_list","required":false,"showWhen":{"field":"연동 방식","is":"외부 시스템 호출 (API)"},"fields":[
      {"name":"key","type":"text","required":true},
      {"name":"value","type":"text","required":false}
    ]},
    {"name":"파라미터 설명","type":"textarea","required":false,"showWhen":{"field":"연동 방식","is":"외부 시스템 호출 (API)"}},
    {"name":"결과를 담을 이름","type":"text","required":true,"contributesToPool":true}
  ]},
  {"name":"완료 시 결과","type":"textarea","required":true},
  {"name":"상담사 연결 조건","type":"textarea","required":false}
]'::jsonb
WHERE name = '대화 시나리오'
  AND NOT (fields::text LIKE '%파라미터 설명%');

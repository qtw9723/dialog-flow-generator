-- Insert node editor features from node sample JSON
-- 노드 에디터의 21개 기능을 자동으로 추가

DELETE FROM public.features WHERE category = 'node_editor';

INSERT INTO public.features (name, category, description, reference_path, prompt_instruction, reference_json) VALUES
('Greeting', 'node_editor', 'Greeting', 'dialogs.nodes.greeting', 'Greeting 노드 실행', '{"nodeType":"greeting","nodeId":"greeting","config":{}}'::jsonb),
('Halo', 'node_editor', 'Halo', 'dialogs.nodes.output', 'Output 노드 실행', '{"nodeType":"output","nodeId":"greeting_output"}'::jsonb),
('그룹', 'node_editor', '기능은 없고 보기 편하게 구분하는 영역. 플로우를 논리적으로 구분할 때 사용', 'dialogs.nodes.group', '그룹 노드로 플로우 구분', '{"nodeType":"group","nodeId":"1KAJU7jxHSvWDqsJEU6hqT","config":{}}'::jsonb),
('컨디션', 'node_editor', '분기 처리를 위한 노드. 조건에 따라 다른 경로로 진행', 'dialogs.nodes.node', '조건 분기 처리', '{"nodeType":"node","nodeId":"oanqcbps8tXZBHhqnST5tZ","config":{"auth":false}}'::jsonb),
('서브다이얼로그', 'node_editor', '내부 노드들을 반복 실행할 때 사용. IF문처럼 조건 처리 가능', 'dialogs.nodes.subflow', '서브다이얼로그 반복/조건 처리', '{"nodeType":"subflow","nodeId":"abTMWA5Z5T5zok1xwqezJg","config":{"loop":{"condition":"","count":""}}}'::jsonb),
('스택', 'node_editor', '플로우의 흐름을 정의. Clear/Save/Repeat/Back/Restore 타입 제공', 'dialogs.nodes.stack', '사용자 상호작용 흐름 제어', '{"nodeType":"stack","nodeId":"pRig4ZB67ZeeWtQwqQuNyJ","config":{"prompt":"","type":"clear","result":[]}}'::jsonb),
('셋', 'node_editor', '변수를 선언하고 값을 할당하는 노드', 'dialogs.nodes.set', '플로우 변수 정의 및 할당', '{"nodeType":"set","nodeId":"vkkehEE3k7yvUo7ZuYo7s6","config":{"items":[]}}'::jsonb),
('ESD', 'node_editor', '데이터베이스 CRUD (MongoDB 기반 데이터 저장소)', 'dialogs.nodes.esd', '데이터 저장소 관리', '{"nodeType":"esd","nodeId":"4YY29fML5nZfPrbemrXqAf","config":{"schemaName":"테스트","query":{"where":"{몽고 DB 스크립트 작성}"},"type":"findone"}}'::jsonb),
('API', 'node_editor', '외부 API를 연동하여 결과값을 변수로 받음', 'dialogs.nodes.api', '외부 서비스 API 호출', '{"nodeType":"api","nodeId":"uSoVwxeyy92Cvt56CYLBni","config":{"apiName":"sample","params":[]}}'::jsonb),
('날씨', 'node_editor', '경도와 위도 기반으로 해당 지역의 날씨 정보 조회', 'dialogs.nodes.weather', '지역 기후 정보 제공', '{"nodeType":"weather","nodeId":"fPWP5Ah6tjXQUAMmhg5Lzv","config":{"latitude":"4.251","longitude":"3.124","items":["now","hour","week","warninfo","life"]}}'::jsonb),
('단축 URL', 'node_editor', '긴 URL을 단축 URL로 변환. 파라미터 함께 전송 가능', 'dialogs.nodes.shorturl', '링크 공유용 단축 URL 생성', '{"nodeType":"shorturl","nodeId":"2mZBW7ZytcyQrAywn3P89g","config":{"url":"testtttt","params":""}}'::jsonb),
('캠페인', 'node_editor', '콜봇 전용. 캠페인 설정을 변경/생성/조회하는 노드', 'dialogs.nodes.campaign', '콜봇 캠페인 관리', '{"nodeType":"campaign","nodeId":"ugpwLG6B8sbKJfkHL6PrpR","config":{"projectId":"f1f7ceef-38d6-4afd-9bc2-20b1b6bf18a3","campaign":"5575fb0b-76d2-4c87-a566-7dbcc830805a","type":"R"}}'::jsonb),
('독 서치', 'node_editor', 'DocStore와 연동하여 정보를 수집. 자체 LLM 기반 검색', 'dialogs.nodes.docquery', '문서 저장소 검색 및 정보 제공', '{"nodeType":"docquery","nodeId":"6a4bTFxWAJuaudLaJUvLcz","config":{"external":false,"storeId":"e90753f6-ff05-4240-8b80-fda203f52d74","input":"오늘 점심 추천"}}'::jsonb),
('아웃풋', 'node_editor', '챗봇 응답 노드. 텍스트, HTML, 이미지, 카드, 차트 등 지원', 'dialogs.nodes.output', '사용자에게 정보/선택지 제공', '{"nodeType":"output","nodeId":"cBcUJDfGv5UFriXwT3rap3","config":{"items":[{"type":"text","channels":[{"name":"Web","use":true}]}]}}'::jsonb),
('LLM 노드', 'node_editor', 'OpenAI API를 통한 LLM 응답 생성. 내부 루프 가능', 'dialogs.nodes.llmchat', 'AI 기반 자연스러운 응답 생성', '{"nodeType":"llmchat","nodeId":"kSsvv97Gtm2bYih6GH7cQP","config":{"type":"openai","model":"Gpt-4o","stream":false}}'::jsonb),
('메일 노드', 'node_editor', '이메일 발송 (HTML 형식)', 'dialogs.nodes.mail', '사용자에게 이메일 알림 전송', '{"nodeType":"mail","nodeId":"fh7bcfbqN6qLiTML1vi2ND","config":{"receiver":"test","title":"test","contentType":"html","content":"test"}}'::jsonb),
('문제 메시지', 'node_editor', '문자 메시지 발송', 'dialogs.nodes.sms', '긴급 공지 및 확인 코드 발송', '{"nodeType":"sms","nodeId":"7eF2rAwk9FosgzXcyjytLv","config":{"receiver":"010-0000-0000","message":"test"}}'::jsonb),
('상담사 연결', 'node_editor', '휴먼 에이전트(상담사) 연결. 외부 상담 채널 연동', 'dialogs.nodes.agent', '복잡한 사항은 실제 상담사에게 인계', '{"nodeType":"agent","nodeId":"3v8UPPhPhp5i6Us4LQpzVb","config":{"counselor":"current","items":[]}}'::jsonb),
('유저노드', 'node_editor', '사용자 인증 및 개인화 데이터 유지', 'dialogs.nodes.auth', '사용자 식별 및 세션 관리', '{"nodeType":"auth","nodeId":"4htqWiBhp4wthQfsc1vHja","config":{"userKey":"test","secure":""}}'::jsonb),
('Fallback', 'node_editor', '매칭되지 않은 입력에 대한 기본 응답 노드', 'dialogs.nodes.fallback', '이해할 수 없는 사용자 입력 처리', '{"nodeType":"fallback","nodeId":"fallback","config":{}}'::jsonb);

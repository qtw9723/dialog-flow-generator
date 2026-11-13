-- llmchat 규칙 갱신: 레퍼런스 풀 골격(tool·body 자동 구성) + 제작 챗봇 정보 기반 prompt.
-- (규칙 변경 — 버전 무관, in-place 갱신: 20260702160000 전례. 두 행 모두 20260702090100이 선행 INSERT.)
-- 근거: 사용자 피드백(2026-07-03) — ① prompt에 제작한 챗봇의 실제 정보(시나리오별 진입 발화·수집·완료)를
-- 넣어 그걸 기반으로 답하게, ② llmchat 서브(body) 노드는 레퍼런스 골격대로 생성기가 자동 구성.

-- 1) Node Usage Rule: tool/body는 생성기가 자동 구성 — flow 설계 대상 아님.
UPDATE solution_rules SET description =
  '질문지의 "AI 자유응답(LLM) 사용" 답변에 따른다. "메뉴 항목으로 추가" 또는 "둘 다"인 경우에만 llmchat 노드를 메뉴 분기 중 하나(예: "AI 상담")로 배치하고, intent에 "AI 자유응답 주제" 답변을 적는다. llmchat은 종결 노드처럼 next를 비워 둔다(내부에서 대화가 이어진다). "기타 질문 응대(폴백)"만 선택한 경우 flow에 llmchat을 넣지 마라 — 생성기가 fallback 자리에 자동으로 넣는다. "사용 안 함"이거나 답이 없으면 llmchat을 절대 사용하지 마라. llmchat의 tool 정의와 body(서브 노드: ask_docs 문서 검색 처리·LLM reset·no_answer 안내)는 생성기가 레퍼런스 골격대로 자동 구성하므로 flow 설계에 포함하지 마라.',
  content = jsonb_build_object('text', 'llmchat은 AI 자유응답 선택 시에만: 메뉴형=메뉴 분기 하나로 배치(next 비움), 폴백형=배치 금지(자동), 미선택=사용 금지. tool/body(서브 노드)는 생성기가 자동 구성.'),
  updated_at = now()
WHERE category = 'Node Usage Rule'
  AND title = 'LLM 노드(llmchat)는 AI 자유응답을 선택했을 때만 배치한다';

-- 2) Value Generation Rule: prompt에 제작 챗봇 정보(시나리오 상세)·도구 사용 섹션 포함.
UPDATE solution_rules SET description =
  'llmchat 노드의 config.prompt는 시스템 프롬프트다. 레퍼런스 "LLM 노드 샘플"의 방식을 따라 백틱(`)으로 감싼 템플릿 리터럴로, 섹션 구조로 쓴다: "## 챗봇 성향"(봇 이름·역할, 사용자가 고른 말투), "## 챗봇 정보"(봇 소개, 산업군, 제공 기능 — 시나리오별 상세: 이름·진입 발화·수집 정보·완료 시 결과 — 와 "AI 자유응답 주제" 답변), "## 도구 사용(문서 검색)"(구체 정보가 필요하면 ask_docs로 문서를 검색해 찾은 내용을 근거로 답한다, query는 한국어 핵심 명사·키워드만, 못 찾으면 no_answer 실행, 도구는 한 번에 하나만), "## 응답 지침". 응답 지침에는 반드시 포함한다 — (1) 챗봇 정보에 적힌 이 챗봇의 실제 정보를 근거로 답한다(주제가 지정돼 있으면 그 주제에 집중) (2) 사용자 요청이 제공 기능(시나리오)로 처리 가능하면 직접 처리하지 말고 해당 시나리오의 진입 발화를 입력하도록 안내한다 (3) 기존 시나리오와 무관한 완전히 다른 주제면 시나리오의 흐름·멘트를 답습하지 말고 챗봇 정보를 바탕으로 새로 답한다 (4) 모르는 내용은 지어내지 말고 답하기 어렵다고 정중히 안내한다 (5) 한국어로 간결하게 답한다. config.apiKey와 docquery의 storeId는 사용자가 DialogFlow 솔루션에서 직접 입력하므로 절대 값을 넣지 마라(빈 문자열 유지). config.tool과 body(서브 노드)는 생성기가 레퍼런스 골격(ask_docs/no_answer)대로 자동 구성한다. model은 gpt-4o, type은 openai를 유지한다.',
  content = jsonb_build_object('text', 'llmchat prompt=백틱 템플릿 + 섹션(챗봇 성향/챗봇 정보(시나리오 상세)/도구 사용/응답 지침). 챗봇 정보 근거 답변, 기능 요청=진입 발화 안내, 무관 질문=답습 금지. ask_docs/no_answer 도구·body는 자동 구성, apiKey·storeId 항상 빈 값.'),
  updated_at = now()
WHERE category = 'Value Generation Rule'
  AND title = 'llmchat의 prompt는 페르소나·주제 한정으로 쓰고 apiKey는 비워 둔다';

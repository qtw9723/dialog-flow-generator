-- LLM 지식소스(문서 검색/일반 LLM/혼합) + 시나리오별 LLM 노드 (설계: docs/superpowers/specs/2026-07-03-*.md)
-- ① 전역 'AI 지식소스' 질문 추가 ② 시나리오 템플릿에 AI 필드 2개 추가 ③ llmchat 규칙 2행 갱신.
-- 생성기는 질문 텍스트 접두사 'AI 지식소스'로 답변을 감지한다(applyLlmBlocks.SOURCE_QUESTION_PREFIX).

-- ① 전역 지식소스 질문 (멱등 — 20260702090000 전례)
INSERT INTO public.questions (text, input_type, is_required, options, order_index, question_role)
SELECT 'AI 지식소스 — AI 자유응답이 무엇을 근거로 답할까요? (기타 응대용)',
       'select', false,
       ARRAY['일반 LLM 답변','문서 검색(내부 문서만)','혼합(문서 우선 + 일반 보완)']::text[],
       (SELECT COALESCE(MAX(order_index), 0) + 1 FROM public.questions),
       'preference'
WHERE NOT EXISTS (SELECT 1 FROM public.questions WHERE text LIKE 'AI 지식소스%');

-- ② 시나리오 템플릿 필드 2개 추가 (⚠ 공유 templates — 프론트 설문 UI에 노출. 멱등: 이미 있으면 no-op)
UPDATE public.templates
SET fields = fields || '[
  {"name": "AI 자유응답 사용", "type": "select", "options": ["아니오", "예"], "required": false,
   "help": "''예''면 이 시나리오 흐름이 끝난 뒤 AI가 이 주제의 후속 질문에 자유롭게 답해요(Q&A 상주)."},
  {"name": "AI 지식소스", "type": "select",
   "options": ["일반 LLM 답변", "문서 검색(내부 문서만)", "혼합(문서 우선 + 일반 보완)"], "required": false,
   "showWhen": {"field": "AI 자유응답 사용", "is": "예"},
   "help": "AI가 무엇을 근거로 답할지 고르세요. 문서 검색=docquery 앱 연동(내부 문서만, storeId는 DialogFlow에서 직접 지정), 일반=LLM 자체 지식, 혼합=문서 우선+일반 보완."}
]'::jsonb,
    updated_at = now()
WHERE id IN (SELECT template_id FROM public.questions WHERE input_type = 'templated' AND template_id IS NOT NULL)
  AND fields::text NOT LIKE '%AI 자유응답 사용%';

-- ③-1 Node Usage Rule: 시나리오별 llmchat 배치(하이브리드 — Stage 1 지시, 3.7이 결정론 보장)
UPDATE solution_rules SET description =
  '질문지에 따라 llmchat을 배치한다. (a) 전역 "AI 자유응답(LLM) 사용"이 "메뉴 항목으로 추가" 또는 "둘 다"면 llmchat을 메뉴 분기 중 하나(예: "AI 상담")로 배치하고 intent에 "AI 자유응답 주제" 답변을 적는다. "기타 질문 응대(폴백)"만이면 flow에 넣지 마라(생성기가 fallback 자리에 자동). (b) 시나리오 항목의 "AI 자유응답 사용"이 "예"인 시나리오는 그 시나리오 흐름의 **마지막 노드 뒤에** llmchat을 배치한다(수집·안내가 끝난 뒤 그 주제의 Q&A를 전담 — 수집이 없으면 진입 직후). intent에 "시나리오이름 Q&A"라고 적는다. llmchat은 종결 노드처럼 next를 비워 둔다(내부에서 대화가 이어진다). 그 외에는 llmchat을 절대 사용하지 마라. llmchat의 tool 정의와 body(서브 노드)는 생성기가 지식소스 설정대로 자동 구성하므로 flow 설계에 포함하지 마라.',
  content = jsonb_build_object('text', 'llmchat 배치: 전역 메뉴형=메뉴 분기 하나(next 비움), 폴백형=배치 금지(자동), 시나리오 "AI 자유응답 사용=예"=그 시나리오 마지막 뒤. 그 외 금지. tool/body는 생성기가 자동 구성.'),
  updated_at = now()
WHERE category = 'Node Usage Rule'
  AND title = 'LLM 노드(llmchat)는 AI 자유응답을 선택했을 때만 배치한다';

-- ③-2 Value Generation Rule: 지식소스별 prompt
UPDATE solution_rules SET description =
  'llmchat 노드의 config.prompt는 시스템 프롬프트다. 백틱(`)으로 감싼 템플릿 리터럴로, 섹션 구조로 쓴다: "## 챗봇 성향"(봇 이름·역할·말투), "## 챗봇 정보"(봇 소개, 산업군, 제공 기능 — 시나리오별 상세: 이름·진입 발화·수집 정보·완료 시 결과 — 와 답변 주제), 지식소스가 문서 검색/혼합이면 "## 도구 사용(문서 검색)"(문서 검색=ask_docs로 찾은 문서 내용만 근거로 답변(내부 정보 한정), 혼합=문서 우선+없으면 일반 지식 보완(근거 구분), query는 한국어 핵심 키워드만, 못 찾으면 no_answer, 도구는 한 번에 하나), "## 응답 지침"(챗봇 정보 근거 답변 / 일반 LLM 소스면 문서 검색 없이 챗봇 정보+일반 지식 / 제공 기능 요청은 진입 발화 안내 / 무관 질문은 시나리오 답습 금지 / 모르면 지어내지 않고 정중 안내 / 한국어 간결). 시나리오 전담 llmchat이면 답변 주제를 그 시나리오로 한정하고 "후속 질문 전담 Q&A"임을 밝힌다. config.apiKey·config.model과 docquery의 storeId는 사용자가 DialogFlow에서 직접 입력(빈 문자열 유지 — 모델은 키에 따라 다름). config.tool·body는 생성기가 지식소스대로 자동 구성(일반 LLM=도구 없음). type은 openai.',
  content = jsonb_build_object('text', 'llmchat prompt=백틱 템플릿+섹션(성향/정보(시나리오 상세)/[도구: docs·mixed만]/지침). 소스별: docs=문서만 근거, general=도구 없이 일반 지식, mixed=문서 우선+보완. 시나리오 전담=주제 한정. apiKey·model·storeId 빈 값(사용자 입력), tool/body 자동 구성.'),
  updated_at = now()
WHERE category = 'Value Generation Rule'
  AND title = 'llmchat의 prompt는 페르소나·주제 한정으로 쓰고 apiKey는 비워 둔다';

-- LLM-구동 플로우 시나리오 규격(수집형 전용) 규칙 반영 (설계: docs/superpowers/specs/2026-07-03-llm-driven-flow-scenarios-design.md)
-- 수집 정보가 있는 "AI 자유응답 사용=예" 시나리오는 생성기가 서브트리를 항목별
-- [기본 응답 output → 수집 판정 llmchat(save 툴 분기)] 체인으로 교체한다 — Stage 1은 진입만 설계.

-- Node Usage Rule 갱신
UPDATE solution_rules SET description =
  '질문지에 따라 llmchat을 배치한다. (a) 전역 "AI 자유응답(LLM) 사용"이 "메뉴 항목으로 추가" 또는 "둘 다"면 llmchat을 메뉴 분기 중 하나(예: "AI 상담")로 배치하고 intent에 "AI 자유응답 주제" 답변을 적는다. "기타 질문 응대(폴백)"만이면 flow에 넣지 마라(생성기가 fallback 자리에 자동). (b) 시나리오 항목의 "AI 자유응답 사용"이 "예"이고 **수집 정보가 없는** 시나리오(Q&A형)는 그 시나리오 흐름의 마지막 노드 뒤에 llmchat을 배치한다(주제 전담 Q&A). (c) "AI 자유응답 사용"이 "예"이고 **수집 정보가 있는** 시나리오(수집형)는 **진입 컨디션 노드와 간단한 내부 흐름만 설계**하라 — 내부는 생성기가 LLM-플로우 체인 규격(항목별 기본 응답 output→수집 판정 llmchat, save 툴 분기)으로 교체한다. llmchat은 종결 노드처럼 next를 비워 둔다(수집형 체인의 연결은 생성기 몫). 그 외에는 llmchat을 절대 사용하지 마라. llmchat의 tool 정의와 body(서브 노드)는 생성기가 자동 구성하므로 flow 설계에 포함하지 마라.',
  content = jsonb_build_object('text', 'llmchat 배치: 전역 메뉴형=메뉴 분기 하나, 폴백형=배치 금지(자동), 시나리오 Q&A형(수집 없음)=마지막 뒤, 수집형(수집 있음)=진입만 설계(생성기가 LLM-플로우 체인으로 교체). 그 외 금지. tool/body 자동 구성.'),
  updated_at = now()
WHERE category = 'Node Usage Rule'
  AND title = 'LLM 노드(llmchat)는 AI 자유응답을 선택했을 때만 배치한다';

-- Value Generation Rule 갱신 (수집 판정 llmchat 규격 추가)
UPDATE solution_rules SET description = description ||
  ' [수집형 LLM 시나리오의 수집 판정 llmchat] 항목마다 전담 llmchat이 생기며 prompt는 "성향+임무" 구조로 쓴다: 방금 요청한 항목을 사용자 답변에서 확인하고, 올바른 값이면 save_{변수명} 도구를 값과 함께 호출(입력 형식 명시), 아니면 상황에 맞게 짧게 답하고 재요청(필수=반복, 선택=빈 값 호출 허용). tool은 save_{변수명} 하나만(지식소스 도구 미부착), body는 [tool 분기 node → set(local.{변수명}=_llm.tool.args.{변수명}, _llm.terminate=true)]. 기본 응답(항목 요청 멘트)은 llmchat 앞의 output 노드가 담당한다("없을 때 되묻는 말" 우선).',
  content = jsonb_build_object('text', (content->>'text') || ' 수집형 체인: 항목별 [기본 응답 output→판정 llmchat(save 툴, terminate로 다음 단계)], 형식 검증은 LLM 판정, 지식소스 도구 미부착.'),
  updated_at = now()
WHERE category = 'Value Generation Rule'
  AND title = 'llmchat의 prompt는 페르소나·주제 한정으로 쓰고 apiKey는 비워 둔다';

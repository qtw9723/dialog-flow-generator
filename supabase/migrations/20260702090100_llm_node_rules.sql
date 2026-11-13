-- AI 자유응답(llmchat) 생성 규칙 2건 (규칙 변경 — 버전 무관, 20260630170000과 동형 멱등 upsert).

-- 1) Node Usage Rule (flow 단계): llmchat 배치 시점.
DO $$
DECLARE
  v_title text := 'LLM 노드(llmchat)는 AI 자유응답을 선택했을 때만 배치한다';
  v_desc  text := '질문지의 "AI 자유응답(LLM) 사용" 답변에 따른다. "메뉴 항목으로 추가" 또는 "둘 다"인 경우에만 llmchat 노드를 메뉴 분기 중 하나(예: "AI 상담")로 배치하고, intent에 "AI 자유응답 주제" 답변을 적는다. llmchat은 종결 노드처럼 next를 비워 둔다(내부에서 대화가 이어진다). "기타 질문 응대(폴백)"만 선택한 경우 flow에 llmchat을 넣지 마라 — 생성기가 fallback 자리에 자동으로 넣는다. "사용 안 함"이거나 답이 없으면 llmchat을 절대 사용하지 마라. tool/docquery 연동은 아직 지원하지 않으므로 설계하지 마라.';
  v_content jsonb := jsonb_build_object('text', 'llmchat은 AI 자유응답 선택 시에만: 메뉴형=메뉴 분기 하나로 배치(next 비움), 폴백형=배치 금지(자동), 미선택=사용 금지.');
  v_id uuid; v_order int;
BEGIN
  SELECT id INTO v_id FROM solution_rules WHERE category = 'Node Usage Rule' AND title = v_title LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE solution_rules SET description = v_desc, content = v_content, updated_at = now() WHERE id = v_id;
  ELSE
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order FROM solution_rules WHERE category = 'Node Usage Rule';
    INSERT INTO solution_rules (category, title, description, content, order_index)
    VALUES ('Node Usage Rule', v_title, v_desc, v_content, v_order);
  END IF;
END $$;

-- 2) Value Generation Rule (config 단계): llmchat prompt 작성 요령. apiKey는 절대 채우지 않는다.
DO $$
DECLARE
  v_title text := 'llmchat의 prompt는 페르소나·주제 한정으로 쓰고 apiKey는 비워 둔다';
  v_desc  text := 'llmchat 노드의 config.prompt는 시스템 프롬프트다: (1) 봇 이름·역할(페르소나)을 밝히고 (2) "AI 자유응답 주제" 답변(없으면 봇 소개·산업군)으로 답변 범위를 한정하며 (3) 범위 밖 질문·모르는 내용은 지어내지 말고 정중히 안내하게 하고 (4) 사용자가 고른 말투를 반영해 한국어로 간결히 답하게 쓴다. config.apiKey는 사용자가 DialogFlow 솔루션에서 직접 입력하므로 절대 값을 넣지 마라(빈 문자열 유지). config.tool도 비워 둔다(도구 연동 미지원). model은 gpt-4o, type은 openai를 유지한다.';
  v_content jsonb := jsonb_build_object('text', 'llmchat prompt=페르소나+주제 한정+모름 시 정중 안내+말투 반영. apiKey/tool은 항상 빈 값.');
  v_id uuid; v_order int;
BEGIN
  SELECT id INTO v_id FROM solution_rules WHERE category = 'Value Generation Rule' AND title = v_title LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE solution_rules SET description = v_desc, content = v_content, updated_at = now() WHERE id = v_id;
  ELSE
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order FROM solution_rules WHERE category = 'Value Generation Rule';
    INSERT INTO solution_rules (category, title, description, content, order_index)
    VALUES ('Value Generation Rule', v_title, v_desc, v_content, v_order);
  END IF;
END $$;

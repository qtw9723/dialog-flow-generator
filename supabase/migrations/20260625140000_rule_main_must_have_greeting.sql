-- 구조 규칙(Node Usage Rule): 메인에는 환영 인사 greeting을 하나 둔다.
-- 코드 안전장치(ensureGreeting)와 함께 2층 방어 — 규칙 문구는 DB, 강제 로직은 코드(CLAUDE.md).
-- description이 프롬프트 주입 본문(rules.ts). 멱등: 같은 title이면 갱신, 없으면 삽입.
DO $$
DECLARE
  v_title text := '메인에는 환영 인사 greeting을 하나 둔다';
  v_desc  text := '메인 다이얼로그에는 대화 시작 시 보여줄 환영 인사 greeting 노드를 정확히 하나 둔다(생략 금지). greeting은 최상위(루트)이며 그 아래에는 인사말 output 하나만 둔다. 시나리오를 greeting 아래에 연결하지 말고, 각 시나리오는 greeting과 같은 최상위(형제 루트)로 둔다.';
  v_content jsonb := jsonb_build_object('text', '메인에는 greeting 노드를 정확히 하나 둔다(루트, 그 아래 인사말 output 하나). 시나리오는 greeting과 형제 루트. greeting 생략 금지.');
  v_id uuid;
  v_order int;
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

-- 생성 규칙(Variable Usage Rule): 수집 정보는 변수명으로 참조하고, 노드에서 항목명을 변수로 쓰지 않는다.
-- description이 프롬프트 주입 본문(rules.ts). 멱등: 같은 title이면 갱신, 없으면 삽입.
DO $$
DECLARE
  v_title text := '수집 정보는 변수명으로 참조 — 항목명을 변수로 쓰지 않는다';
  v_desc  text := '각 수집 정보 항목은 사람용 라벨인 ''항목명''과 선택 입력인 ''변수명''을 가진다. 변수로 쓸 식별자는 ''변수명''이며, 변수명이 비어 있으면 ''항목명''을 보고 일관된 영문 변수명(영문·숫자·밑줄)을 새로 지어 그것을 변수로 쓴다. set·조건(분기)·api·esd·output 멘트 등 어떤 노드에서도 ''항목명''(특히 한글 라벨)을 변수로 직접 사용하지 않는다 — 항상 그 항목의 변수명(없으면 생성한 영문명)을 사용한다. 한 번 정한 변수명은 모든 노드에서 동일하게 쓰고, 같은 정보에 다른 이름을 만들지 않는다. (외부 연동의 ''결과를 담을 이름''도 같은 성격의 변수명이다.)';
  v_content jsonb := jsonb_build_object('text', '수집정보는 변수명으로 참조. 변수명이 비면 항목명에서 영문 변수명을 생성. 어떤 노드에서도 항목명을 변수로 쓰지 않는다.');
  v_id uuid;
  v_order int;
BEGIN
  SELECT id INTO v_id FROM solution_rules WHERE category = 'Variable Usage Rule' AND title = v_title LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE solution_rules SET description = v_desc, content = v_content, updated_at = now() WHERE id = v_id;
  ELSE
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order FROM solution_rules WHERE category = 'Variable Usage Rule';
    INSERT INTO solution_rules (category, title, description, content, order_index)
    VALUES ('Variable Usage Rule', v_title, v_desc, v_content, v_order);
  END IF;
END $$;

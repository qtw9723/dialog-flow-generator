-- 이 솔루션 런타임은 JSON(객체/배열) 변수를 통째로 화면에 보여주지 못한다 — 개별(스칼라) 값만 렌더된다.
-- 따라서 JSON 데이터를 보여줄 땐 통째 참조(${변수}) 금지, 정확한 키로 개별 값을 하나하나 참조한다.
-- (직전 PR #88의 "배열은 통째로 ${local.menu} 참조"는 잘못된 가이드였으므로 바로잡음.)

-- 1) Variable Usage Rule 갱신(제목 동일 → in-place): "통째로" 표현 제거, "정확한 키로 하나하나"로.
DO $$
DECLARE
  v_title text := '값을 함수로 가공하지 말고 변수를 그대로 쓴다(멘트는 풀어서 나열)';
  v_desc  text := '이 솔루션 런타임은 (1) 멘트·값 식에서 join·map·filter·concat 같은 함수/메서드 호출을 거의 지원하지 못하고, (2) JSON(객체/배열) 변수를 통째로 화면에 보여주지 못한다(개별 값만 렌더). 그러므로: 함수로 가공하지 말고, JSON은 통째(${변수})로 쓰지 말고, 보여줄 값을 정확한 키로 하나하나 참조한다. 객체는 ${변수.정확한키}로 키마다 따로(예: "예약자 ${order.name}, 연락처 ${order.phone}"). 배열(여러 개 수집/조회)은 원소를 인덱스+키로 하나하나 ${목록[0].키}, ${목록[1].키}처럼 나열한다. 한 멘트에 여러 값을 보여줄 땐 각 값을 풀어서 개별 나열한다. 스칼라(텍스트/숫자) 변수만 ${변수}로 그대로 쓸 수 있다. 예외: 분기 조건에서 쓰는 문서화된 DialogFlow 술어(input.text.includes("값"), _result, entity("..."), intent("...") 등)는 그대로 사용한다 — 이 규칙은 ''값을 표시/가공''하는 식에 한정한다.';
  v_content jsonb := jsonb_build_object('text', 'JSON(객체/배열)·함수 통째 표시 불가. 객체는 ${변수.키}, 배열은 ${목록[0].키}처럼 정확한 키로 하나하나. 스칼라만 ${변수} 그대로. (조건의 includes/entity/intent는 예외.)');
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

-- 2) Output Message Rule(루프 플래그 룰) 갱신: 배열 "통째로" → 정확한 키로 개별.
UPDATE solution_rules SET description =
  '반복 수집 루프의 종료/제어 플래그(예: context.xDone — 루프를 멈추려고 true/false를 담는 boolean)는 데이터가 아니다. output 멘트에 ${context.xDone}처럼 그 플래그를 절대 노출하지 마라("메뉴가 true로 확인되었습니다" 같은 오류 방지). 수집한 값을 보여주려면 값이 누적된 배열은 통째로 안 보이므로 원소를 정확한 키로 하나하나 참조하라(예: ${local.menu[0].name}, ${local.menu[1].name}). join 등 함수로 가공하지 마라. 멘트에는 그 노드의 "쓸 수 있는 변수" 목록에 있는 실제 데이터 변수만, 정확한 키로 쓴다.',
  updated_at = now()
WHERE category='Output Message Rule' AND title='루프 종료 플래그는 멘트에 노출하지 않는다(수집값은 배열로 보여준다)';

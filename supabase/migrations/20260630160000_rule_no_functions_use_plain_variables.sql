-- 이 솔루션 런타임은 멘트/값 표시에서 join·map 같은 함수·메서드를 거의 지원하지 않는다.
-- → 값을 보여줄 땐 함수로 가공하지 말고 변수를 그대로 ${변수명}으로 풀어서 하나하나 작성한다.
-- 단, 분기 조건의 문서화된 DialogFlow 술어(input.text.includes(...), entity(...), intent(...))는 예외(그대로 사용).

-- 1) 직전 PR(#86)에서 추가한 Output Message Rule의 join 예시를 제거(런타임 미지원이므로 잘못된 가이드였음).
UPDATE solution_rules SET description =
  '반복 수집 루프의 종료/제어 플래그(예: context.xDone — 루프를 멈추려고 true/false를 담는 boolean)는 데이터가 아니다. output 멘트에 ${context.xDone}처럼 그 플래그를 절대 노출하지 마라("메뉴가 true로 확인되었습니다" 같은 오류 방지). 수집한 값을 보여주려면 값이 누적된 배열 변수(예: local.menu)를 그대로 ${local.menu}로 참조하라 — join 등 함수로 가공하지 마라(이 런타임은 지원하지 않는다). 멘트에는 그 노드의 "쓸 수 있는 변수" 목록에 있는 실제 데이터 변수만 쓴다.',
  updated_at = now()
WHERE category='Output Message Rule' AND title='루프 종료 플래그는 멘트에 노출하지 않는다(수집값은 배열로 보여준다)';

-- 2) 일반 규칙(Variable Usage Rule — 모든 단계에 주입): 함수로 값을 가공하지 말고 변수를 그대로 쓴다.
DO $$
DECLARE
  v_title text := '값을 함수로 가공하지 말고 변수를 그대로 쓴다(멘트는 풀어서 나열)';
  v_desc  text := '이 솔루션 런타임은 멘트·값 식에서 join·map·filter·concat 같은 함수/메서드 호출을 거의 지원하지 못한다. 값을 보여주거나 다룰 때 함수로 가공하지 말고 변수를 그대로 ${변수명}으로 쓴다. 한 멘트에 여러 값을 보여줄 땐 각 변수를 따로 풀어서 하나하나 나열한다(예: "예약일은 ${local.reservationDate}, 연락처는 ${local.phone}입니다"). 여러 개 수집된 배열 변수도 ${local.menu}처럼 통째로 참조하고 ${local.menu.join('', '')} 같은 함수 호출을 쓰지 마라. 예외: 분기 조건에서 쓰는 문서화된 DialogFlow 술어(input.text.includes("값"), _result, entity("..."), intent("...") 등)는 그대로 사용한다 — 이 금지는 ''값을 표시/가공''하는 식에 한정한다.';
  v_content jsonb := jsonb_build_object('text', '멘트·값 식에서 join 등 함수/메서드 금지. 변수는 ${변수명}으로 그대로, 여러 값은 따로 나열, 배열은 통째로 참조. (조건의 DialogFlow 술어 includes/entity/intent는 예외.)');
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

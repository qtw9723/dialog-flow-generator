-- 루프 종료/제어 플래그를 output 멘트에 데이터처럼 노출하는 버그(예: "메뉴가 ${context.menuDone}로 확인되었습니다") 방지.
-- 코드(fillValues.loopControlVars)가 멘트용 변수 목록에서 제어 플래그를 결정론적으로 제외하고,
-- 이 Output Message Rule이 LLM에게 "종료 플래그는 데이터가 아니다 → 수집 배열을 보여줘라"를 지시한다.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT 'Output Message Rule', '루프 종료 플래그는 멘트에 노출하지 않는다(수집값은 배열로 보여준다)',
  '반복 수집 루프의 종료/제어 플래그(예: context.xDone — 루프를 멈추려고 true/false를 담는 boolean)는 데이터가 아니다. output 멘트에 ${context.xDone}처럼 그 플래그를 절대 노출하지 마라("메뉴가 true로 확인되었습니다" 같은 오류 방지). 수집한 값을 보여주려면 값이 누적된 배열 변수(예: local.menu)를 참조하라 — 여러 건이면 ${local.menu.join('', '')}처럼 join하거나 "N건"으로 안내한다. 멘트에는 그 노드의 "쓸 수 있는 변수" 목록에 있는 실제 데이터 변수만 쓴다.',
  '{}'::jsonb, 21
WHERE NOT EXISTS (SELECT 1 FROM solution_rules WHERE category='Output Message Rule' AND title='루프 종료 플래그는 멘트에 노출하지 않는다(수집값은 배열로 보여준다)');

UPDATE solution_rules SET description =
  '반복 수집 루프의 종료/제어 플래그(예: context.xDone — 루프를 멈추려고 true/false를 담는 boolean)는 데이터가 아니다. output 멘트에 ${context.xDone}처럼 그 플래그를 절대 노출하지 마라("메뉴가 true로 확인되었습니다" 같은 오류 방지). 수집한 값을 보여주려면 값이 누적된 배열 변수(예: local.menu)를 참조하라 — 여러 건이면 ${local.menu.join('', '')}처럼 join하거나 "N건"으로 안내한다. 멘트에는 그 노드의 "쓸 수 있는 변수" 목록에 있는 실제 데이터 변수만 쓴다.',
  updated_at = now()
WHERE category='Output Message Rule' AND title='루프 종료 플래그는 멘트에 노출하지 않는다(수집값은 배열로 보여준다)';

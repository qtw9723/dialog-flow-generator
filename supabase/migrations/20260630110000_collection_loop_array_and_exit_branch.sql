-- 반복 수집(목록 모으기) 루프 생성 품질 규칙. 규칙=DB(CLAUDE.md).
-- 배경: 메뉴 반복 수집 루프에서 (1) 빈 컨디션 노드 방치, (2) 한 변수에 덮어씀, (3) 탈출 flag 미조작 → 무한 반복.

-- 1) Node Usage Rule (flow 단계): 수집 루프 본문 구조 — 탈출 분기를 본문 안에 둔다.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT 'Node Usage Rule', '반복 수집 루프 본문은 탈출 분기를 둔다',
  '여러 번 입력받아 모으는 반복(수집) 루프의 본문은 다음 구조로 만든다: (1) 항목 요청 output → (2) 분기. 분기는 부모가 아니라 자식 노드들의 condition으로 판별한다 — 사용자가 종료 발화를 하면(예: input.text.includes(''그만'')) set 노드로 루프 exitVar를 true로 만들어 탈출하고, 그 외에는 항목을 누적 저장한다. 본문 안에서 exitVar를 반드시 조작해야 루프가 멈춘다(진입 전 init에서 false로만 두고 본문에서 true로 안 켜면 최대 횟수까지 무의미하게 반복된다). 분기도 효과도 없는 빈 컨디션 노드를 본문 끝에 두지 마라.',
  '{}'::jsonb, 70
WHERE NOT EXISTS (SELECT 1 FROM solution_rules WHERE category='Node Usage Rule' AND title='반복 수집 루프 본문은 탈출 분기를 둔다');

UPDATE solution_rules SET description =
  '여러 번 입력받아 모으는 반복(수집) 루프의 본문은 다음 구조로 만든다: (1) 항목 요청 output → (2) 분기. 분기는 부모가 아니라 자식 노드들의 condition으로 판별한다 — 사용자가 종료 발화를 하면(예: input.text.includes(''그만'')) set 노드로 루프 exitVar를 true로 만들어 탈출하고, 그 외에는 항목을 누적 저장한다. 본문 안에서 exitVar를 반드시 조작해야 루프가 멈춘다(진입 전 init에서 false로만 두고 본문에서 true로 안 켜면 최대 횟수까지 무의미하게 반복된다). 분기도 효과도 없는 빈 컨디션 노드를 본문 끝에 두지 마라.',
  updated_at = now()
WHERE category='Node Usage Rule' AND title='반복 수집 루프 본문은 탈출 분기를 둔다';

-- 2) Value Generation Rule (config 단계): 수집 값은 배열에 누적(concat), 덮어쓰기 금지.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT 'Value Generation Rule', '반복 수집 값은 배열에 누적(덮어쓰기 금지)',
  '여러 번 입력받아 모으는 값(예: 주문 메뉴 목록)은 한 변수에 input.text로 덮어쓰지 말고 배열에 누적한다. 루프 진입 전 set으로 빈 배열을 초기화하고(value를 식 "[]"로), 본문의 누적 set은 value를 "local.X.concat([input.text])"로 한다(스프레드 [...] 대신 concat 사용). 이후 출력·저장에서는 "${local.X.join('', '')}"로 문자열화하거나 배열 그대로 참조한다. 단일 값(한 번만 받는 값)은 종전대로 input.text를 그대로 저장한다.',
  '{}'::jsonb, 50
WHERE NOT EXISTS (SELECT 1 FROM solution_rules WHERE category='Value Generation Rule' AND title='반복 수집 값은 배열에 누적(덮어쓰기 금지)');

UPDATE solution_rules SET description =
  '여러 번 입력받아 모으는 값(예: 주문 메뉴 목록)은 한 변수에 input.text로 덮어쓰지 말고 배열에 누적한다. 루프 진입 전 set으로 빈 배열을 초기화하고(value를 식 "[]"로), 본문의 누적 set은 value를 "local.X.concat([input.text])"로 한다(스프레드 [...] 대신 concat 사용). 이후 출력·저장에서는 "${local.X.join('', '')}"로 문자열화하거나 배열 그대로 참조한다. 단일 값(한 번만 받는 값)은 종전대로 input.text를 그대로 저장한다.',
  updated_at = now()
WHERE category='Value Generation Rule' AND title='반복 수집 값은 배열에 누적(덮어쓰기 금지)';

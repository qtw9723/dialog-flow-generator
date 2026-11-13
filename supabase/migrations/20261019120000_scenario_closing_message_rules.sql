-- 2026-10-19: 시나리오 마무리 안내(설문 '완료 시 결과') 규칙 — 문구는 DB, CLAUDE.md 규약.
-- 사용자: 시나리오는 항상 output으로 끝나야 하고, 마무리 안내를 적으면 그 내용으로, 비우면 LLM이
--         "업무가 처리되었다 + 그 업무에서 처리한 데이터"를 보여주며 끝낸다.
-- 그동안 마무리에 대한 규칙이 한 줄도 없어, '배송 상태 안내 및 상담기록 저장' 같은 설명조 입력이
-- 그대로 멘트가 되거나 제멋대로 해석됐다. 설문 화면은 표시명 '시나리오 마무리 안내'·선택 입력(코드, fieldOverrides.js).
-- 멱등: 같은 category+title이 있으면 no-op.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT
  'Node Usage Rule',
  '시나리오는 마무리 안내로 끝난다',
  '모든 시나리오 흐름은 끝에 마무리 안내 output 노드로 끝난다. 저장(esd create·set)이나 조회·API 노드로 흐름을 끝내지 마라 — 그 뒤에 마무리 output을 둔다. ' ||
  '분기가 있으면 각 갈래의 끝도 output이다(실패 갈래는 실패 안내). 질문지 시나리오의 ''완료 시 결과''(화면 표시명 ''시나리오 마무리 안내'')가 성공 경로 마지막 output의 내용이다.',
  '{"text": "시나리오는 마무리 output으로 끝난다(저장·조회 노드로 끝내지 않음, 갈래마다 끝은 output)."}'::jsonb,
  13
WHERE NOT EXISTS (
  SELECT 1 FROM solution_rules WHERE category = 'Node Usage Rule' AND title = '시나리오는 마무리 안내로 끝난다'
);

INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT
  'Output Message Rule',
  '시나리오 마무리 안내',
  '시나리오 성공 경로의 마지막 output(마무리 안내)은 질문지의 그 시나리오 ''완료 시 결과''(화면 표시명 ''시나리오 마무리 안내'')를 따른다. ' ||
  '(1) 봇이 그대로 말할 수 있는 문장이면 그 문장을 그대로 쓴다 — 안의 ${...}만 그 노드의 ''쓸 수 있는 변수'' 목록의 정확한 키로 맞추고, 목록에 없는 값은 빼고 문장을 자연스럽게 다듬는다. ' ||
  '(2) ''예약 접수 안내''·''배송 상태 안내 및 상담기록 저장''처럼 할 일을 적은 설명이면 그 설명을 멘트로 옮기지 말고 그 뜻대로 마무리 문장을 쓴다. ' ||
  '(3) 비어 있으면 그 시나리오의 업무가 처리되었음을 알리고(예: ''진료 예약이 완료되었습니다.''), 그 시나리오에서 받은 정보·조회 결과·저장한 값을 정확한 키로 보여준 뒤 마무리한다(예: ''예약일: ${local.reservationDate}''). ' ||
  '(2)·(3)에서 보여줄 값은 ''쓸 수 있는 변수'' 목록의 실제 데이터 변수만 쓰고 루프 제어 플래그는 빼며, 말투는 질문지의 말투를 따른다.',
  '{"text": "마무리 안내: 문장이면 그대로(변수 키만 맞춤) / 설명이면 뜻대로 작성 / 비면 업무 처리 완료 + 처리한 데이터 표시."}'::jsonb,
  23
WHERE NOT EXISTS (
  SELECT 1 FROM solution_rules WHERE category = 'Output Message Rule' AND title = '시나리오 마무리 안내'
);

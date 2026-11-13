-- 2026-10-20: 시나리오 흐름(단계) — 설문에 단계가 있으면 그 순서대로 설계한다. 문구는 DB(CLAUDE.md).
-- 설계: docs/superpowers/specs/2026-10-20-scenario-steps-flow-design.md
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT
  'Solution Rule',
  '시나리오 단계 순서대로 설계',
  '질문지 시나리오에 ''단계''(순서 있는 목록)가 있으면 그 순서대로 노드를 설계한다 — 순서를 바꾸거나 단계를 빼거나 없는 단계를 더하지 마라. ' ||
  '정보 받기 = 항목마다 output(요청)→set(저장), 안내 = output 하나(내용이 설명이면 그 뜻대로 문장), 연동 = 연동 방식에 따라 api 또는 esd 노드, ' ||
  '분기 = 갈래를 판별하는 컨디션 노드와 갈래마다 자식(조건은 자식 condition), 각 갈래는 먼저 ''그 경우 봇의 행동''을 output으로 보여준다. ' ||
  '갈래의 ''이후''가 ''여기서 종료''면 그 갈래는 거기서 끝나고, ''이어서 진행''이면 분기 뒤 단계들이 그 갈래 아래로 이어진다. ' ||
  '''이어서 진행'' 갈래가 여럿이면 뒤 단계들을 갈래마다 복사해 잇는다(흐름은 트리 — 한 노드에 부모는 하나). 마지막은 마무리 안내 output.',
  '{"text": "단계가 있으면 그 순서대로 설계(정보 받기=output→set, 안내=output, 연동=api/esd, 분기=컨디션+갈래, 종료 갈래는 끝, 이어서 갈래 아래로 뒤 단계)."}'::jsonb,
  2
WHERE NOT EXISTS (
  SELECT 1 FROM solution_rules WHERE category = 'Solution Rule' AND title = '시나리오 단계 순서대로 설계'
);

-- 2026-10-20 dev 검증에서 발견: '회원 조회 → 분기(조회됨/없음)'의 분기 조건이 entity("회원정보:회원조회됨")
-- (사용자 발화 기준)로 생성됐다. 조회 결과로 갈리는 분기는 결과 변수 비교여야 한다.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT
  'Condition Rule',
  '조회 결과로 갈리는 분기는 결과 변수로 판별',
  '분기가 바로 앞 연동(api·esd)의 결과로 갈리면 — 질문지 갈래의 조건 대상이 연동의 ''결과를 담을 이름''이거나, 직접 입력 조건이 ''조회됨/없음/성공/실패/있음'' 같은 결과 판단이면 — ' ||
  'entity()가 아니라 그 연동 노드가 결과를 저장한 변수로 비교한다(예: 조회됨 = local.memberInfo != null, 없음 = local.memberInfo == null). ' ||
  'entity()는 사용자가 방금 한 말로 갈릴 때만 쓴다.',
  '{"text": "조회 결과 분기 = 결과 변수 비교(local.x != null / == null), entity는 사용자 발화 분기에만."}'::jsonb,
  12
WHERE NOT EXISTS (
  SELECT 1 FROM solution_rules WHERE category = 'Condition Rule' AND title = '조회 결과로 갈리는 분기는 결과 변수로 판별'
);

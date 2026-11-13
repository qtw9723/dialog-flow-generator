-- 컨디션 노드(node 타입) 사용 범위 한정. 규칙=DB(CLAUDE.md). flow 단계 프롬프트에 주입됨.
-- 기존 "시나리오 시작은 컨디션 노드", "분기는 condition 필드" 규칙에 더해, 그 외 용도 금지(배타) 규칙 추가.
-- 배경: 빈 컨디션 노드(예: 분기 없는 '메뉴 추가 여부 확인')가 자리표시로 생성돼 흐름이 어지러워짐.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT 'Node Usage Rule', '컨디션 노드는 시나리오 시작·분기 전용',
  '컨디션 노드(node 타입)는 (1) 시나리오 진입(시작) 트리거와 (2) 분기(서로 배타적인 갈래 선택), 이 두 용도로만 쓴다. 그 외에는 컨디션 노드를 만들지 마라 — 단순 통과/자리표시 노드, 흐름 중간에서 ''확인·판단''만 하고 분기는 없는 노드, 값 저장이나 반복 제어를 대신하는 노드로 쓰지 않는다. 분기 없이 다음 단계로 이어지기만 하는 자리에는 컨디션 노드 대신 그 동작에 맞는 노드(output·set·api·esd 등)를 직접 잇고, 마땅한 동작이 없으면 노드를 아예 만들지 않는다. 예: 반복에서 ''메뉴를 더 추가할지'' 판단은 빈 컨디션 노드가 아니라 loop 본문에서 탈출 flag(exitVar)를 켜는 set 노드로 처리한다. 갈래가 필요하면 자식 노드들의 condition 필드로 배타 분기를 만든다.',
  '{}'::jsonb, 60
WHERE NOT EXISTS (SELECT 1 FROM solution_rules WHERE category='Node Usage Rule' AND title='컨디션 노드는 시나리오 시작·분기 전용');

UPDATE solution_rules SET description =
  '컨디션 노드(node 타입)는 (1) 시나리오 진입(시작) 트리거와 (2) 분기(서로 배타적인 갈래 선택), 이 두 용도로만 쓴다. 그 외에는 컨디션 노드를 만들지 마라 — 단순 통과/자리표시 노드, 흐름 중간에서 ''확인·판단''만 하고 분기는 없는 노드, 값 저장이나 반복 제어를 대신하는 노드로 쓰지 않는다. 분기 없이 다음 단계로 이어지기만 하는 자리에는 컨디션 노드 대신 그 동작에 맞는 노드(output·set·api·esd 등)를 직접 잇고, 마땅한 동작이 없으면 노드를 아예 만들지 않는다. 예: 반복에서 ''메뉴를 더 추가할지'' 판단은 빈 컨디션 노드가 아니라 loop 본문에서 탈출 flag(exitVar)를 켜는 set 노드로 처리한다. 갈래가 필요하면 자식 노드들의 condition 필드로 배타 분기를 만든다.',
  updated_at = now()
WHERE category='Node Usage Rule' AND title='컨디션 노드는 시나리오 시작·분기 전용';

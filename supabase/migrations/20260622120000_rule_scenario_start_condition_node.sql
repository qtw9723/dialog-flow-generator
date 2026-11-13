-- 규칙 추가(데이터-구동): 시나리오의 시작은 항상 컨디션 노드(node 타입)를 사용한다.
-- 기존 "분기는 condition 필드 / stack은 흐름조작 전용" 규칙의 충돌 문구
-- (별도의 타입 노드가 아니다 / 진입은 output·node)를 정합화한다.

UPDATE solution_rules
SET description = '갈래 선택(성공/실패 등)은 부모가 아니라 자식 노드의 condition(조건식) 필드로 판별한다(서로 배타적). stack 노드는 흐름 조작 전용(저장 save·처음으로 clear·반복 repeat·뒤로 back·복원 restore)이며, 분기나 시나리오 진입에는 절대 쓰지 마라.',
    content = '{"text":"갈래 선택은 자식 노드 condition으로, stack은 흐름조작 전용."}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'Node Usage Rule' AND title = '분기는 condition 필드 / stack은 흐름조작 전용';

INSERT INTO solution_rules (category, title, description, content, order_index) VALUES
(
  'Node Usage Rule',
  '시나리오 시작은 컨디션 노드 사용',
  '각 시나리오의 진입점(시작) 노드는 항상 컨디션 노드(node 타입)를 사용한다. 진입 발화 트리거 조건은 그 컨디션 노드의 condition 필드에 둔다(조건식은 이후 단계가 채움). 시나리오 시작을 output 등 다른 타입으로 만들지 말고, 컨디션 노드로 시작한 뒤 그 아래에 시나리오 단계를 잇는다.',
  '{"text":"시나리오 시작 노드는 항상 컨디션 노드(node 타입)."}'::jsonb,
  5
);

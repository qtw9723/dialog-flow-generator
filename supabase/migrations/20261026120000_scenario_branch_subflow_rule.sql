-- 2026-10-26: 분기 갈래별 하위 흐름 — 갈래에 '단계'가 있으면 그 갈래 아래에 그 단계들을 순서대로 설계한다. 문구는 DB(CLAUDE.md).
-- 설계: docs/superpowers/specs/2026-10-21-branch-subflows-design.md
-- 멱등: 덧붙일 문장이 이미 있으면 건너뛴다.
UPDATE solution_rules
SET description = description || ' 갈래에 ''단계''(하위 흐름)가 있으면 그 갈래 자식 아래에 그 단계들을 같은 규칙으로 순서대로 설계한다(갈래의 첫 노드가 조건을 갖고, ''그 경우 봇의 행동''이 비었으면 따로 output을 만들지 않는다). ' ||
  '''이어서 진행''이면 갈래 단계들 뒤에 분기 다음 단계들을 잇고, ''여기서 종료''면 갈래 단계들 뒤에 마무리 안내로 끝낸다. 갈래의 단계는 다른 갈래 아래에 두지 마라.'
WHERE category = 'Solution Rule'
  AND title = '시나리오 단계 순서대로 설계'
  AND description NOT LIKE '%하위 흐름%';

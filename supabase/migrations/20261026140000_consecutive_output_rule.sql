-- 2026-10-26: 이어지는 안내는 한 output으로 — output이 나가면 그 턴이 끝나, 바로 아래의 조건 없는 output은
-- 사용자가 한 번 더 입력해야 나온다(솔루션에서 확인). 문구는 DB(CLAUDE.md), 강제는 코드(mergeConsecutiveOutputs).
-- 멱등: 덧붙일 문장이 이미 있으면 건너뛴다.
UPDATE solution_rules
SET description = description || ' 안내(output) 바로 다음에 사용자 입력 없이 이어서 보여줄 안내가 있으면 output을 둘로 나누지 말고 한 output의 items에 순서대로 넣어라 — output이 나가면 그 턴이 끝나므로, 나눠 두면 사용자가 한 번 더 말해야 뒤 안내가 나온다. 질문 output 다음에는 입력을 받는 노드(set·분기 등)를 둔다.'
WHERE category = 'Solution Rule'
  AND title = '시나리오 단계 순서대로 설계'
  AND description NOT LIKE '%한 output의 items에 순서대로%';

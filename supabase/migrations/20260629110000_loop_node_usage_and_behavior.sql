-- 루프(subflow) LLM 교육 + 동작 설정. 규칙=DB(CLAUDE.md).
-- 1) Node Usage Rule: 언제/어떻게 loop 노드를 쓰는지(자연어). flow 단계 프롬프트에 주입됨.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT 'Node Usage Rule', '반복 루프(loop) 사용',
  '특정 구간을 조건 충족까지 반복해야 하면 type "loop" 노드를 쓴다. loop 노드는 loop.body(반복 본문 진입 노드 id 배열), loop.exitVar(탈출 flag 변수명), loop.max(안전 최대 반복, 선택)를 가진다. next는 탈출 후 이어질 노드다. 반복 본문 안에는 종료 조건이 충족됐을 때 set 노드로 그 exitVar를 true로 설정하는 노드를 반드시 둔다(그래야 탈출, 없으면 무한 반복). 목록 수집("하나 더 추가?"), 외부연동 재시도, 특정 조건까지 반복 등에 사용한다. exitVar는 다른 변수와 동일한 명명 규칙을 따른다.',
  '{}'::jsonb, 100
WHERE NOT EXISTS (SELECT 1 FROM solution_rules WHERE category='Node Usage Rule' AND title='반복 루프(loop) 사용');

UPDATE solution_rules SET description =
  '특정 구간을 조건 충족까지 반복해야 하면 type "loop" 노드를 쓴다. loop 노드는 loop.body(반복 본문 진입 노드 id 배열), loop.exitVar(탈출 flag 변수명), loop.max(안전 최대 반복, 선택)를 가진다. next는 탈출 후 이어질 노드다. 반복 본문 안에는 종료 조건이 충족됐을 때 set 노드로 그 exitVar를 true로 설정하는 노드를 반드시 둔다(그래야 탈출, 없으면 무한 반복). 목록 수집("하나 더 추가?"), 외부연동 재시도, 특정 조건까지 반복 등에 사용한다. exitVar는 다른 변수와 동일한 명명 규칙을 따른다.',
  updated_at = now()
WHERE category='Node Usage Rule' AND title='반복 루프(loop) 사용';

-- 2) Loop Rule 설정 행: 루프 동작 튜너블(resolveLoopBehavior가 읽음). 멱등.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT 'Loop Rule', '루프 동작 설정',
  'LLM-작성 flag 루프의 동작 파라미터. exitCompare="== true"(엄격) 또는 "truthy". autoInitFlag=true면 루프 진입 전 exitVar=false를 자동 주입. defaultMax=노드 max 미지정 시 안전 최대 반복.',
  '{"exitCompare":"== true","autoInitFlag":true,"defaultMax":10}'::jsonb, 1
WHERE NOT EXISTS (SELECT 1 FROM solution_rules WHERE category='Loop Rule' AND title='루프 동작 설정');

UPDATE solution_rules SET content = '{"exitCompare":"== true","autoInitFlag":true,"defaultMax":10}'::jsonb,
  updated_at = now()
WHERE category='Loop Rule' AND title='루프 동작 설정';

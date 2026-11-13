-- 레퍼런스(레스토랑·샘플 보험사) 실제 subflow 루프 분석 반영:
--  - 모든 루프 조건이 맨 truthy(예: context.isMenu)이고 "== true" 형태는 전무 → 기본 truthy로 변경.
--  - 탈출 flag는 context. 네임스페이스, set value는 식 'true'/'false'(boolean으로 평가).

-- 1) 루프 동작 설정: exitCompare 기본을 truthy로.
UPDATE solution_rules
  SET content = '{"exitCompare":"truthy","autoInitFlag":true,"defaultMax":10}'::jsonb,
      updated_at = now()
  WHERE category = 'Loop Rule' AND title = '루프 동작 설정';

-- 2) Node Usage Rule(반복 루프 사용): 레퍼런스 관용 반영.
UPDATE solution_rules
  SET description = '특정 구간을 조건 충족까지 반복해야 하면 type "loop" 노드를 쓴다. loop 노드는 loop.body(반복 본문 진입 노드 id 배열), loop.exitVar(탈출 flag 변수명), loop.max(안전 최대 반복, 선택)를 가진다. next는 탈출 후 이어질 노드다. 탈출 flag는 context. 네임스페이스를 쓴다(예: context.done). 반복 본문 안에는 종료 조건이 충족됐을 때 set 노드로 그 flag를 켜는 노드를 반드시 둔다 — set의 value는 식 "true"(켜기)/"false"(끄기)로 boolean으로 평가된다. 루프는 그 flag가 truthy가 되면 탈출한다(없으면 무한 반복). 목록 수집("하나 더 추가?"), 외부연동 재시도, 특정 조건까지 반복 등에 사용한다.',
      updated_at = now()
  WHERE category = 'Node Usage Rule' AND title = '반복 루프(loop) 사용';

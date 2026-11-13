-- 어드민 혼란 제거: "루프 규칙" 탭은 기계 설정/데이터다. LLM이 언제·어떻게 루프를 쓰는지(자연어 사용법)는
-- [노드 사용 규칙] 탭의 "반복 루프(loop) 사용" 행에 있음을 설명에 명시한다. (display 텍스트만, 코드 미소비)
UPDATE solution_rules
  SET description = 'LLM-작성 flag 루프의 기계 파라미터. exitCompare="truthy"(맨 flag가 truthy면 탈출, 권장) 또는 "== true". autoInitFlag=true면 루프 진입 전 flag=false 자동 주입. defaultMax=노드 max 미지정 시 안전 최대 반복. ※ LLM이 언제·어떻게 루프를 쓰는지(사용법)는 [노드 사용 규칙] 탭의 "반복 루프(loop) 사용" 행에서 관리한다.',
      updated_at = now()
  WHERE category = 'Loop Rule' AND title = '루프 동작 설정';

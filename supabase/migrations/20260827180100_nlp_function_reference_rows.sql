-- NLP 함수 규약 — 솔루션이 제공하는 intent/entity 술어의 정본(2026-08-27 사용자 제공).
-- 참조 전용이다: RULE_STAGE_BY_CATEGORY에 매핑되지 않아 프롬프트에 주입되지 않는다.
-- 지금 코드에 하드코딩된 불완전한 목록(fillValues.ts의 [DialogFlow 술어] 줄)의 정본이며,
-- v0.8.1에서 조건 생성을 이 규약 기준으로 바꾸며 하드코딩을 걷어낸다.
-- 규칙 행 추가는 버전 무관 데이터 변경이다(CHANGELOG의 "규칙 변경" 참고).

INSERT INTO solution_rules (category, title, description, content, order_index)
VALUES
('NLP Function Reference', 'intent() — 단일 인텐트 확인',
 'intent(name, confidence, format). 인자 모두 선택. confidence 기본 0.2, format 기본 false. ' ||
 'intent() → ''card_info'' 또는 ''''. intent(true) → {intent, confidence}. ' ||
 'intent(''card_info'') → ''card_info'' 또는 ''''. intent(''card_info'', 0.4, true) → 객체. ' ||
 'Top 인텐트 하나만 본다.',
 '{"text":"intent(name?, confidence=0.2, format=false) — Top 인텐트 확인. format=true면 {intent, confidence} 객체."}'::jsonb, 1),

('NLP Function Reference', 'intents() — 복수 인텐트 확인',
 'intents(name, confidence, format). confidence 0.2 이상인 인텐트를 배열로 돌려준다. ' ||
 'intents() → [''card_info'', ''my_card_benefit'', ...] 또는 []. intents(true) → [{intent, confidence}, ...]. ' ||
 'intents(''card_info'', 0.4, true) → 필터된 객체 배열.',
 '{"text":"intents(name?, confidence=0.2, format=false) — confidence 이상인 인텐트 배열."}'::jsonb, 2),

('NLP Function Reference', 'entity() — 단일 엔티티 확인 (name:value 문법)',
 'entity(name:value, format). entity(''card_type'') → ''green'' 또는 ''''. ' ||
 'entity(''card_type'', true) → {entity, value, location, confidence, literal}. ' ||
 '**entity(''card_type:M'')** → ''M'' 또는 '''' — 엔티티명과 value를 함께 체크한다. ' ||
 '이 name:value 문법이 인텐트(대분류) 안에서 세부를 가르는 근거다.',
 '{"text":"entity(name[:value], format=false) — 첫 매칭 엔티티. name:value로 값까지 체크."}'::jsonb, 3),

('NLP Function Reference', 'entities() — 복수 엔티티 확인',
 'entities(name:value, format). entities() → [''혜택'', ''green'', ''M''] 또는 []. ' ||
 'entities(''card_type'') → [''green'', ''M'']. entities(''card_type'', true) → 객체 배열. ' ||
 '엔티티 객체 형식: {entity, location:[시작,끝], value, confidence, literal}.',
 '{"text":"entities(name[:value], format=false) — 매칭 엔티티 배열."}'::jsonb, 4),

('NLP Function Reference', '와일드카드 — 이름 패턴 매칭',
 'intent/entity 이름에 * 를 쓸 수 있다. intent(''card_*'') = ''card_''로 시작. ' ||
 'intent(''*_info'') = ''_info''로 끝남. intent(''ca*info'') = ''ca''로 시작하고 ''info''로 끝남. ' ||
 'intent(''card_*'', 0.4) = 패턴 + confidence 임계. ' ||
 'entity(''ca*type:the'') = 엔티티명 패턴 + value가 ''the''로 시작.',
 '{"text":"intent/entity 이름에 * 와일드카드 사용 가능. confidence 임계와 조합 가능."}'::jsonb, 5);

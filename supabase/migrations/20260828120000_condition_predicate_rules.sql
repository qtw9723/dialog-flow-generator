-- v0.8.1: 조건 프롬프트에 하드코딩돼 있던 "[DialogFlow 술어]" 한 줄을 solution_rules로 옮긴다.
-- 규칙 문구는 DB, 강제 로직은 코드 — CLAUDE.md 규약.
--
-- ⚠ intent()/entity()의 상세 규약은 별도 카테고리 `NLP Function Reference` 5행에 있다(v0.8.0 등록).
--    여기 행은 "조건에서 쓸 수 있는 술어가 무엇인지"를 알려주는 목록이다.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT
  'Condition Rule',
  '조건에서 쓸 수 있는 술어',
  'condition에 쓸 수 있는 술어는 다음뿐이다. ① 시나리오 진입: intent("<인텐트명>") ' ||
  '② 사용자 발화로 갈리는 분기: entity("<엔티티명>:<값>") ' ||
  '③ 버튼/포스트백 분기: _postback == "값" ' ||
  '④ 앞 노드가 저장한 값 판별: local.<변수> != null 같은 변수 비교 ' ||
  '⑤ 반복 탈출: context.<flag> (본문 set 노드가 boolean으로 채운 것). ' ||
  '진입 조건에 input.text 계열(문자열 매칭)을 쓰지 마라 — 표현이 조금만 달라도 진입하지 못한다. ' ||
  'intent·entity 이름은 프롬프트가 제시한 "사용 가능한" 목록에 있는 것만 쓴다.',
  '{"text": "조건 술어: intent()(진입) / entity(name:value)(발화 분기) / _postback(버튼) / 변수 비교(저장값) / context flag(반복 탈출). 진입에 input.text 금지."}'::jsonb,
  11
WHERE NOT EXISTS (
  SELECT 1 FROM solution_rules
  WHERE category = 'Condition Rule' AND title = '조건에서 쓸 수 있는 술어'
);

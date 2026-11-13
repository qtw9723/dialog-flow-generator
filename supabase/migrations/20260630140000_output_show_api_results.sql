-- API·ESD 조회 결과를 output 멘트에서 실제로 보여주도록 하는 Output Message Rule.
-- 코드(declaredVarsOf)가 api 결과 변수를 output에 노출하고, 이 규칙이 "결과를 보여줘라"를 지시한다.
INSERT INTO solution_rules (category, title, description, content, order_index)
SELECT 'Output Message Rule', '조회(API·ESD) 결과는 멘트에서 값으로 보여준다',
  '외부 연동(API·ESD) 조회 결과는 그 다음 output 멘트에서 실제 값을 사용자에게 보여준다. ''조회했어요''/''확인했습니다''로만 끝내지 말고 결과 값을 노출하라. 결과는 그 노드의 ''쓸 수 있는 변수'' 목록에 JSON 객체(결과변수)로 표기된다. 사용자가 보여줄 값을 명시했으면(수집/외부연동의 ''받을 정보'' 등에 적은 필드) 그 필드를 ${결과변수.필드}로 그대로 쓰고, 자연어로만 요청했으면 결과 객체의 필드 중 의미가 맞는 것을 골라 ${결과변수.필드}로 보여준다(예: 날씨 조회면 온도·상태 필드). 목록에 있는 결과변수만 참조하고, 없는 변수는 지어내지 않는다.',
  '{}'::jsonb, 20
WHERE NOT EXISTS (SELECT 1 FROM solution_rules WHERE category='Output Message Rule' AND title='조회(API·ESD) 결과는 멘트에서 값으로 보여준다');

UPDATE solution_rules SET description =
  '외부 연동(API·ESD) 조회 결과는 그 다음 output 멘트에서 실제 값을 사용자에게 보여준다. ''조회했어요''/''확인했습니다''로만 끝내지 말고 결과 값을 노출하라. 결과는 그 노드의 ''쓸 수 있는 변수'' 목록에 JSON 객체(결과변수)로 표기된다. 사용자가 보여줄 값을 명시했으면(수집/외부연동의 ''받을 정보'' 등에 적은 필드) 그 필드를 ${결과변수.필드}로 그대로 쓰고, 자연어로만 요청했으면 결과 객체의 필드 중 의미가 맞는 것을 골라 ${결과변수.필드}로 보여준다(예: 날씨 조회면 온도·상태 필드). 목록에 있는 결과변수만 참조하고, 없는 변수는 지어내지 않는다.',
  updated_at = now()
WHERE category='Output Message Rule' AND title='조회(API·ESD) 결과는 멘트에서 값으로 보여준다';

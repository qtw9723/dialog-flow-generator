-- 규칙을 데이터-구동으로 전환: 생성기 프롬프트에 하드코딩돼 있던 규칙들을 solution_rules로 이전.
-- 어드민(/admin/solution-rules)·레퍼런스 학습이 이 규칙들을 수정·추가하면 생성에 즉시 반영된다.

-- 1) 단계별 규칙 카테고리 확장 (fill 단계: 값 생성/output 멘트/조건)
ALTER TABLE solution_rules DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE solution_rules ADD CONSTRAINT valid_category CHECK (category IN (
  'Solution Rule',
  'System Variable',
  'Node Usage Rule',
  'Variable Usage Rule',
  'Value Generation Rule',
  'Output Message Rule',
  'Condition Rule'
));

-- 2) 하드코딩돼 있던 규칙들을 시드 (description = 프롬프트에 주입되는 규칙 본문, content = 동일 텍스트)
INSERT INTO solution_rules (category, title, description, content, order_index) VALUES
(
  'Node Usage Rule',
  '분기는 condition 필드 / stack은 흐름조작 전용',
  '분기·조건 판별은 노드의 condition(조건식) 필드로 한다 — 별도의 분기/조건 "타입" 노드가 아니다. 시나리오 진입(어떤 발화로 시작되는가)도, 갈래 선택(성공/실패 등)도 모두 일반 노드(output·node)에 condition을 달아 표현하며 조건식은 이후 단계가 채운다. stack 노드는 흐름 조작 전용(저장 save·처음으로 clear·반복 repeat·뒤로 back·복원 restore)이며, 분기나 시나리오 진입에는 절대 쓰지 마라.',
  '{"text":"분기는 condition 필드로, stack은 흐름조작 전용."}'::jsonb,
  10
),
(
  'Variable Usage Rule',
  '변수는 선언 후 사용 · 미선언 변수 날조 금지',
  '어떤 변수를 사용하는 노드(저장/조회 esd, 결과를 안내하는 output)는 그 변수를 만드는 노드(set, 또는 결과를 저장하는 esd)보다 반드시 뒤(하류)에 와야 한다. 같은 시나리오 갈래 안에서 선언→사용 순서를 지키고, 다른 시나리오에서 만든 변수를 갖다 쓰지 마라. 변수를 참조할 땐 반드시 그 노드보다 앞 흐름에서 선언된 변수만 쓰고, 존재하지 않는 변수를 지어내지 마라.',
  '{"text":"변수는 앞 흐름에서 선언된 것만 사용. 미선언 변수 날조 금지."}'::jsonb,
  10
),
(
  'Value Generation Rule',
  'set 변수 명명·스코프',
  'set은 직전에 입력받은 값을 변수에 저장한다. 변수명은 반드시 영어(이름→name, 전화번호→phone, 이메일→email, 진료요청내용→inquiry, 예약번호→bookNo, 인원수→pCnt). 개인정보(이름·전화번호·이메일·주소·생년월일)는 local 스코프, 그 외 플로우 제어/공유 값은 context 스코프. 값을 생성하는 경우(난수 등)는 그 표현식을 쓴다.',
  '{"text":"set 변수명은 영어, 개인정보=local·그외=context 스코프."}'::jsonb,
  10
),
(
  'Value Generation Rule',
  'ESD result 저장 형태 (스코프 변수 · 객체/배열)',
  'esd의 result는 조회·저장 결과 _result를 의미있는 스코프 변수에 담는다. key는 스코프(local/context)+데이터 종류를 나타내는 영문 이름(예: 예약=local.reservation, 메뉴 목록=local.menuList) — 제네릭 "result"·스코프 생략 금지. _result의 형태: create·findone(단건)이면 스키마 필드를 담은 JSON 객체, findall(다건)이면 그 객체들의 배열이다. 이후 노드는 객체면 ${key.필드}, 배열이면 ${key[0].필드}로 참조한다.',
  '{"text":"esd result는 _result를 스코프 변수에 저장(create/findone=객체, findall=배열)."}'::jsonb,
  20
),
(
  'Value Generation Rule',
  '시스템 생성 식별자는 난수로 생성·저장',
  '사용자가 입력하지도, 어딘가에서 조회되지도 않지만 결과로 안내해야 하는 값(예약번호·주문번호·접수번호 등)은 create의 data에 난수 표현식으로 직접 생성해서 저장한다. 예: data에 "bookNo":"Math.floor(Math.random()*1000000)". 그러면 저장되고 _result로 돌아와 이후 ${변수.bookNo}로 안내할 수 있다. 앞에서 set/조회로 만든 적 없는 값을 그냥 참조하지 말고, 안내가 필요하면 이렇게 생성·저장하라.',
  '{"text":"안내할 식별자(예약번호 등)는 create data에 난수로 생성·저장."}'::jsonb,
  30
),
(
  'Output Message Rule',
  '멘트 변수·필드 참조 규칙',
  '멘트에서 값을 보여줄 땐 각 노드의 "쓸 수 있는 변수" 목록(앞 흐름에서 선언됨)에 있는 것만 ${변수} 형식으로 쓴다. 목록에 없는 변수(다른 시나리오·뒤 노드·존재하지 않는 변수)는 절대 지어내지 마라. JSON 객체 변수는 ${변수.필드}로 나열된 필드만 꺼내고, 배열 변수는 첫 항목 ${변수[0].필드}를 쓰거나 "N건 조회됨"으로 안내한다. 저장·조회된 적 없는 값(예: 만든 적 없는 예약번호)은 멘트에서 참조하지 마라. 적절한 변수가 없으면 변수 없이 자연스러운 안내문만 쓴다.',
  '{"text":"멘트는 앞 흐름 선언 변수만, 객체는 .필드·배열은 [0].필드, 없는 값 날조 금지."}'::jsonb,
  10
);

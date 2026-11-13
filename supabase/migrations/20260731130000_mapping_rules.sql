-- ESD 매핑 유도 지침 3종: Variable Usage Rule · Value Generation Rule · Output Message Rule
-- description이 프롬프트 주입 본문(rules.ts). 멱등: 같은 title이면 갱신, 없으면 삽입.

-- ① Variable Usage Rule: 매핑된 ESD 필드의 이름·타입 정합 (flow+config+output+condition 전 단계 주입)
DO $$
DECLARE
  v_title text := '매핑된 ESD 필드가 있으면 이름·타입에 정합한 변수를 사용한다';
  v_desc  text := '생성 요청에 ESD(Entity-Service Definition) 필드가 매핑돼 있으면, 해당 필드의 이름(fieldName)과 타입(fieldType)에 정확히 정합하는 변수명과 타입을 사용한다. 매핑된 필드의 이름은 변수명의 기준이 되고(예: fieldName=''userName'' → 변수명 userName 또는 user_name), 타입(text·number·boolean·date 등)은 해당 변수의 collect 노드 타입·조건 분기 방식·output 멘트 형식에 그대로 반영된다. 매핑이 없는 변수는 종전 방식대로 자유롭게 작성한다.';
  v_content jsonb := jsonb_build_object('text', 'ESD 필드 매핑 있으면 fieldName→변수명, fieldType→변수 타입·조건·멘트 형식에 정합.');
  v_id uuid;
  v_order int;
BEGIN
  SELECT id INTO v_id FROM solution_rules WHERE category = 'Variable Usage Rule' AND title = v_title LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE solution_rules SET description = v_desc, content = v_content, updated_at = now() WHERE id = v_id;
  ELSE
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order FROM solution_rules WHERE category = 'Variable Usage Rule';
    INSERT INTO solution_rules (category, title, description, content, order_index)
    VALUES ('Variable Usage Rule', v_title, v_desc, v_content, v_order);
  END IF;
END $$;

-- ② Value Generation Rule: 매핑된 ESD 필드의 키(식별자)·암호화(crypt) 정합한 set/esd 값 생성 (config 단계)
DO $$
DECLARE
  v_title text := '매핑된 ESD 필드가 있으면 키·암호화에 정합한 set/esd 값을 생성한다';
  v_desc  text := '생성 요청에 ESD 필드가 매핑돼 있으면, 해당 필드의 식별자 키(fieldKey)와 암호화 여부(crypt)를 set·esd 노드의 값 생성에 그대로 반영한다. fieldKey가 있으면 그 키를 esd 노드의 key 속성으로 사용하고, crypt="true"이면 esd 노드에 crypt 옵션을 붙인다(예: crypt:"true" 필드는 esd 호출 시 crypt:true). 매핑이 없는 set/esd 값은 종전 방식대로 자유롭게 작성한다.';
  v_content jsonb := jsonb_build_object('text', 'ESD 필드 매핑 있으면 fieldKey→esd key, crypt:"true"→esd crypt:true에 정합.');
  v_id uuid;
  v_order int;
BEGIN
  SELECT id INTO v_id FROM solution_rules WHERE category = 'Value Generation Rule' AND title = v_title LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE solution_rules SET description = v_desc, content = v_content, updated_at = now() WHERE id = v_id;
  ELSE
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order FROM solution_rules WHERE category = 'Value Generation Rule';
    INSERT INTO solution_rules (category, title, description, content, order_index)
    VALUES ('Value Generation Rule', v_title, v_desc, v_content, v_order);
  END IF;
END $$;

-- ③ Output Message Rule: output 멘트가 매핑된 ESD 필드의 이름·타입을 올바르게 참조 (output 단계)
DO $$
DECLARE
  v_title text := '매핑된 ESD 필드가 있으면 output 멘트에서 그 이름·타입에 정합한 변수를 참조한다';
  v_desc  text := '생성 요청에 ESD 필드가 매핑돼 있으면, output 멘트(output 노드의 message)에서 그 필드에 대응하는 변수를 참조할 때 fieldName 기반 변수명을 사용하고, fieldType에 맞는 표현 형식(숫자이면 단위·포맷, 날짜이면 날짜 형식, boolean이면 예/아니오 등)을 적용한다. 매핑된 필드를 멘트에 표시할 때 임의의 다른 변수명이나 항목명을 쓰지 않는다. 매핑이 없는 변수는 종전 방식대로 자유롭게 참조한다.';
  v_content jsonb := jsonb_build_object('text', 'ESD 필드 매핑 있으면 output 멘트에서 fieldName 변수·fieldType 형식에 정합.');
  v_id uuid;
  v_order int;
BEGIN
  SELECT id INTO v_id FROM solution_rules WHERE category = 'Output Message Rule' AND title = v_title LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE solution_rules SET description = v_desc, content = v_content, updated_at = now() WHERE id = v_id;
  ELSE
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order FROM solution_rules WHERE category = 'Output Message Rule';
    INSERT INTO solution_rules (category, title, description, content, order_index)
    VALUES ('Output Message Rule', v_title, v_desc, v_content, v_order);
  END IF;
END $$;

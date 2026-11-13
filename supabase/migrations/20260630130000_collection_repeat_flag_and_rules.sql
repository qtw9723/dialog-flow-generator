-- 반복 수집을 결정론화: 수집 항목에 '여러 개 입력' 플래그 추가 + LLM은 output→set만 설계하도록 규칙 전환.
-- 실제 반복 루프(누적 concat + '그만' 종료 분기 + 초기화)는 파이프라인(wrapCollectionLoops)이 결정론적으로 생성.

-- 1) 템플릿 '수집 정보' 그룹에 '여러 개 입력'(예/아니오) 추가 (멱등: 최종 subfields로 교체)
DO $$
DECLARE
  t RECORD;
  i int;
  new_subfields jsonb := '[
    {"name":"항목명","type":"text","required":true},
    {"name":"변수명","type":"text","required":false,"validate":"variableName","contributesToPool":true,"poolFallback":"항목명"},
    {"name":"필수 여부","type":"select","required":true,"options":["필수","선택"]},
    {"name":"입력 형식","type":"select","required":true,"options":["자유텍스트","숫자","날짜","전화번호","이메일","시간","기타"]},
    {"name":"여러 개 입력","type":"select","required":false,"options":["아니오","예"]},
    {"name":"없을 때 되묻는 말","type":"textarea","required":false}
  ]'::jsonb;
BEGIN
  FOR t IN SELECT id, fields FROM templates WHERE fields IS NOT NULL LOOP
    FOR i IN 0 .. jsonb_array_length(t.fields) - 1 LOOP
      IF (t.fields -> i ->> 'name') = '수집 정보' THEN
        UPDATE templates
          SET fields = jsonb_set(fields, ARRAY[i::text, 'fields'], new_subfields, true),
              updated_at = now()
          WHERE id = t.id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 2) 규칙 전환: '반복 수집 루프를 LLM이 설계'(PR #76)에서 'output→set만, 시스템이 감싼다'로.
UPDATE solution_rules SET
  title = '여러 개 입력 항목은 output→set만 설계(반복은 시스템이 감쌈)',
  description =
    '수집 항목 중 ''여러 개 입력''이 ''예''인 항목(목록 수집, 예: 주문 메뉴)은 직접 type:"loop" 노드·누적·종료 분기를 만들지 마라. 다른 단일 항목과 똑같이 output(요청)→set(저장, value는 input.text) 하나로만 설계한다. 시스템이 그 쌍을 자동으로 반복 수집 루프(배열 누적 + ''그만'' 종료 분기 + 초기화)로 감싼다. 즉 ''여러 개 입력'' 때문에 루프나 분기 노드를 추가하지 않는다.',
  updated_at = now()
WHERE category='Node Usage Rule' AND title='반복 수집 루프 본문은 탈출 분기를 둔다';

UPDATE solution_rules SET
  title = '여러 개 입력 항목 저장은 input.text 그대로',
  description =
    '''여러 개 입력''=''예'' 항목의 저장 set은 value를 input.text 그대로 둔다. 배열 누적(concat)·초기화는 시스템이 자동 처리하므로 set value에 concat 등 누적식을 직접 쓰지 마라. 한 번만 받는 단일 값도 종전대로 input.text를 저장한다.',
  updated_at = now()
WHERE category='Value Generation Rule' AND title='반복 수집 값은 배열에 누적(덮어쓰기 금지)';

-- 검증 재시도 루프 확장: 수집 정보 '입력 형식' 선택지에 전화번호·이메일·시간 추가 +
-- 그에 맞는 Loop Rule 정규식 행 시드. 둘이 짝을 이뤄야 wrapValidationLoops가 실제로 래핑한다.
-- (resolveLoopRule는 여러 Loop Rule 행을 병합 — 행 1개 = 입력형식 1개 검증 규칙.)

-- 1) 템플릿 '수집 정보' 그룹의 '입력 형식' 선택지 확장 (멱등: 최종 subfields로 교체)
DO $$
DECLARE
  t RECORD;
  i int;
  new_subfields jsonb := '[
    {"name":"항목명","type":"text","required":true},
    {"name":"변수명","type":"text","required":false,"validate":"variableName","contributesToPool":true,"poolFallback":"항목명"},
    {"name":"필수 여부","type":"select","required":true,"options":["필수","선택"]},
    {"name":"입력 형식","type":"select","required":true,"options":["자유텍스트","숫자","날짜","전화번호","이메일","시간","기타"]},
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

-- 2) Loop Rule 형식 행 시드 (행 1개 = 입력형식 1개). 멱등: 같은 title 있으면 content 갱신.
--    regex는 슬래시 제외 본문. 런타임에서 `<변수>.match(/<regex>/)`로 평가된다.
DO $$
DECLARE
  seeds jsonb := '[
    {"title":"전화번호 형식 검증","format":"전화번호","regex":"^[0-9]{2,3}-?[0-9]{3,4}-?[0-9]{4}$","desc":"수집 항목의 입력 형식이 ''전화번호''일 때, 02-1234-5678 / 010-1234-5678 같은 전화번호 형식이 될 때까지 되묻는다."},
    {"title":"이메일 형식 검증","format":"이메일","regex":"^[^@ ]+@[^@ ]+\\.[^@ ]+$","desc":"수집 항목의 입력 형식이 ''이메일''일 때, name@example.com 같은 이메일 형식이 될 때까지 되묻는다."},
    {"title":"시간 형식 검증","format":"시간","regex":"^([01][0-9]|2[0-3]):[0-5][0-9]$","desc":"수집 항목의 입력 형식이 ''시간''일 때, 24시간제 HH:MM(예: 09:30, 18:05) 형식이 될 때까지 되묻는다."}
  ]'::jsonb;
  s jsonb;
  idx int := 11;
BEGIN
  FOR s IN SELECT * FROM jsonb_array_elements(seeds) LOOP
    INSERT INTO solution_rules (category, title, description, content, order_index)
    SELECT 'Loop Rule', s->>'title', s->>'desc',
           jsonb_build_object('format', s->>'format', 'regex', s->>'regex'), idx
    WHERE NOT EXISTS (
      SELECT 1 FROM solution_rules WHERE category = 'Loop Rule' AND title = s->>'title'
    );

    UPDATE solution_rules
      SET content = jsonb_build_object('format', s->>'format', 'regex', s->>'regex'),
          description = s->>'desc',
          updated_at = now()
      WHERE category = 'Loop Rule' AND title = s->>'title';

    idx := idx + 1;
  END LOOP;
END $$;

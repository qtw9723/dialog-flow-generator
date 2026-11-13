-- 수집 정보 그룹에 선택 '변수명' 필드 추가, '항목명'은 contributesToPool 제거(라벨 전용).
-- 변수명이 비면 풀에서 항목명으로 폴백(코드 computeSharedPool의 poolFallback). 멱등: 최종 상태로 교체.
DO $$
DECLARE
  t RECORD;
  i int;
  new_subfields jsonb := '[
    {"name":"항목명","type":"text","required":true},
    {"name":"변수명","type":"text","required":false,"validate":"variableName","contributesToPool":true,"poolFallback":"항목명"},
    {"name":"필수 여부","type":"select","required":true,"options":["필수","선택"]},
    {"name":"입력 형식","type":"select","required":true,"options":["자유텍스트","숫자","날짜","기타"]},
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

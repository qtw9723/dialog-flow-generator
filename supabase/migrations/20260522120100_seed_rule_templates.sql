-- ============================================
-- Seed Rule Templates
-- ============================================
-- Insert 36 rule templates across 6 types
-- Each type has 3-4 templates with basic and advanced categories

-- ============================================
-- 1. Direct Templates (3)
-- ============================================
INSERT INTO public.rule_templates (name, rule_type, category, description, example_config)
VALUES
  ('Static Value', 'direct', 'basic', '고정된 정적 값을 직접 설정합니다', '{"value":"fixed value"}'::jsonb),
  ('Computed Value', 'direct', 'advanced', '계산된 값(예: 현재 시간, UUID)', '{"value":"{{now()}}"}'::jsonb),
  ('Constant Placeholder', 'direct', 'basic', '미리 정의된 상수 값을 사용합니다', '{"value":"default_constant"}'::jsonb);

-- ============================================
-- 2. Template Templates (4)
-- ============================================
INSERT INTO public.rule_templates (name, rule_type, category, description, example_config)
VALUES
  ('Simple Template', 'template', 'basic', '단순 변수 치환 템플릿 (예: Hello ${name})', '{"template":"Hello ${name}"}'::jsonb),
  ('Nested Template', 'template', 'advanced', '중첩된 객체 필드 참조 템플릿', '{"template":"${user.profile.name} from ${user.location}"}'::jsonb),
  ('Conditional Template', 'template', 'advanced', '조건부 템플릿 (삼항 연산자 지원)', '{"template":"${status === ''active'' ? ''Active'' : ''Inactive''}"}'::jsonb),
  ('Template with Defaults', 'template', 'advanced', '기본값을 포함한 템플릿', '{"template":"${name || ''Anonymous''}"}'::jsonb);

-- ============================================
-- 3. Function Templates (4)
-- ============================================
INSERT INTO public.rule_templates (name, rule_type, category, description, example_config)
VALUES
  ('String Manipulation', 'function', 'basic', '문자열을 대문자/소문자로 변환하거나 자릅니다', '{"function_code":"return responses[''input'']?.toUpperCase() || '''';"}' ::jsonb),
  ('Numeric Calculation', 'function', 'basic', '숫자 계산 (합계, 평균, 곱셈 등)', '{"function_code":"return parseInt(responses[''quantity'']) * 10;"}'::jsonb),
  ('Array Generation', 'function', 'advanced', '배열 생성 및 변환', '{"function_code":"return [responses[''item1''], responses[''item2'']].filter(x => x);"}'::jsonb),
  ('Custom Logic', 'function', 'advanced', '복잡한 비즈니스 로직 구현', '{"function_code":"const val = responses[''value''];\nreturn val > 100 ? val * 1.1 : val;"}'::jsonb);

-- ============================================
-- 4. Conditional Templates (3)
-- ============================================
INSERT INTO public.rule_templates (name, rule_type, category, description, example_config)
VALUES
  ('Simple If-Else', 'conditional', 'basic', '단순 if-else 조건', '{"condition":{"field":"status","operator":"equals","value":"approved","then":{"type":"direct","value":"Approved"},"else":{"type":"direct","value":"Pending"}}}'::jsonb),
  ('Multiple Conditions', 'conditional', 'advanced', '여러 조건 조합 (AND/OR)', '{"condition":{"field":"role","operator":"equals","value":"admin","then":{"type":"direct","value":"Full Access"},"else":{"type":"direct","value":"Limited Access"}}}'::jsonb),
  ('Switch-like Conditional', 'conditional', 'advanced', '여러 값에 따른 분기 (switch문 형태)', '{"condition":{"field":"priority","operator":"equals","value":"high","then":{"type":"direct","value":"Urgent"},"else":{"type":"direct","value":"Normal"}}}'::jsonb);

-- ============================================
-- 5. Array Templates (4)
-- ============================================
INSERT INTO public.rule_templates (name, rule_type, category, description, example_config)
VALUES
  ('Fixed Count Array', 'array', 'basic', '고정된 개수의 배열 요소 생성', '{"count":3,"element_rule":{"type":"direct","value":"item"}}'::jsonb),
  ('Dynamic Count Array', 'array', 'advanced', '사용자 입력에 따른 동적 배열 개수', '{"count_source":"responses[''count'']","element_rule":{"type":"direct","value":"item"}}'::jsonb),
  ('Array from List', 'array', 'basic', '리스트에서 배열 생성', '{"items":["item1","item2","item3"]}'::jsonb),
  ('Array with Index', 'array', 'advanced', '인덱스 정보를 포함한 배열 생성', '{"count":5,"element_rule":{"type":"template","template":"Item ${array_index}"}}'::jsonb);

-- ============================================
-- 6. Reference Templates (3)
-- ============================================
INSERT INTO public.rule_templates (name, rule_type, category, description, example_config)
VALUES
  ('Direct Reference', 'reference', 'basic', '다른 필드값을 직접 참조', '{"source_field":"dialogs[0].nodes[0].label"}'::jsonb),
  ('Nested Reference', 'reference', 'advanced', '중첩된 객체의 필드 참조', '{"source_field":"metadata.created_by.name"}'::jsonb),
  ('Array Reference', 'reference', 'advanced', '배열 요소를 참조하여 새 배열 생성', '{"source_field":"items[*].id","transform":"unique"}'::jsonb);

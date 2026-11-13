-- Add scenario description and identified features to dialogflow_references
ALTER TABLE public.dialogflow_references
ADD COLUMN IF NOT EXISTS scenario_description TEXT,
ADD COLUMN IF NOT EXISTS identified_features JSONB;

-- Add comments
COMMENT ON COLUMN public.dialogflow_references.scenario_description IS
'Scenario description that helps LLM understand what this reference should do. Example: "사용자 입력받고 → 변수 저장 → API 호출 후 → 결과로 발화"';

COMMENT ON COLUMN public.dialogflow_references.identified_features IS
'Features identified by LLM based on scenario_description. Array of feature objects with name, purpose, and reference_paths.';

-- Create index for finding references with scenarios
CREATE INDEX IF NOT EXISTS idx_dialogflow_references_scenario ON dialogflow_references(scenario_description);

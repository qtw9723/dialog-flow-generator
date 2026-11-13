-- 카테고리별 시나리오 레퍼런스(학습 자료). 각 행 = 자체-완결 미니봇 flow_json.
-- Mode A: 생성 시 few-shot 예시로 주입. Mode B: 사용자가 직접 받아 사용(단일/조립).

CREATE TABLE IF NOT EXISTS dialogflow_scenario_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  flow_json JSONB NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- 산업군 질문 옵션과 동일한 카테고리 택소노미
  CONSTRAINT valid_scenario_category CHECK (category IN ('금융','물류','소매','도매','의료','기타'))
);

CREATE INDEX IF NOT EXISTS idx_scenario_refs_category ON dialogflow_scenario_references(category, order_index);

COMMENT ON TABLE dialogflow_scenario_references IS '카테고리별 시나리오 레퍼런스(자체-완결 미니봇 flow_json). few-shot 예시·직접 제공용';
COMMENT ON COLUMN dialogflow_scenario_references.category IS '봇 카테고리(금융/물류/소매/도매/의료/기타) — 산업군 질문 옵션과 동일';
COMMENT ON COLUMN dialogflow_scenario_references.flow_json IS '자체-완결 미니봇(greeting+시나리오 1개+Pre/Post/fallback), 그대로 import 가능';

-- API 레퍼런스(학습 자료): DialogFlow import용 API 정의(엔드포인트당 1행).
-- API 연동 시나리오에서 선택하거나, 생성 시 import용 API 정의 파일로 출력한다.

CREATE TABLE IF NOT EXISTS dialogflow_api_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  method TEXT,
  api_def JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_refs_name ON dialogflow_api_references(name);

COMMENT ON TABLE dialogflow_api_references IS 'API 레퍼런스 — DialogFlow import용 API 정의(엔드포인트당 1행). 어드민 전용.';
COMMENT ON COLUMN dialogflow_api_references.api_def IS 'API import 형식의 단일 정의(name·method·contentType·content·headers·params·result·url·authType·authParams)';

-- features 테이블: 프로젝트에서 사용 가능한 기능들 정의
CREATE TABLE IF NOT EXISTS public.features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id UUID NOT NULL REFERENCES public.dialogflow_references(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- "사용자 발화", "변수 저장" 등
  description TEXT,                            -- 기능 설명
  category TEXT,                               -- "dialogue", "storage", "calculation" 등
  reference_path TEXT NOT NULL,                -- "dialogs[0].text", "variables.user_input" 등
  example_value TEXT,                          -- 예시 값
  prompt_instruction TEXT,                     -- LLM이 이 기능을 사용할 때의 지시사항
  order_index INT DEFAULT 0,                   -- 프롬프트에서의 표시 순서
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_features_reference ON public.features(reference_id);
CREATE INDEX idx_features_enabled ON public.features(enabled);

-- 댓글
COMMENT ON TABLE public.features IS 'Reference의 가능한 기능들을 정의 (LLM 프롬프트 생성 시 활용)';
COMMENT ON COLUMN public.features.reference_path IS 'Master JSON 상의 경로 (예: dialogs[0].text)';
COMMENT ON COLUMN public.features.prompt_instruction IS 'LLM에 제공할 지시사항 (예: "사용자와 대화하는 대사를 입력합니다")';

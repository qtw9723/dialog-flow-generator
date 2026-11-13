-- features 테이블을 global로 변경 (reference_id 제거)
-- features는 모든 references에 적용되는 전역 기능 정의

-- 기존 constraints 제거
ALTER TABLE public.questions
DROP CONSTRAINT IF EXISTS questions_feature_id_fkey;

-- 기존 인덱스 삭제
DROP INDEX IF EXISTS public.idx_features_reference;
DROP INDEX IF EXISTS public.idx_features_enabled;

-- reference_id 컬럼 삭제
ALTER TABLE public.features
DROP COLUMN IF EXISTS reference_id CASCADE;

-- 새 컬럼 추가 (category가 없으면)
ALTER TABLE public.features
ADD COLUMN IF NOT EXISTS category TEXT;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_features_enabled ON public.features(enabled);
CREATE INDEX IF NOT EXISTS idx_features_category ON public.features(category);

-- 주석 업데이트
COMMENT ON TABLE public.features IS '모든 References에 적용되는 전역 기능 정의 (LLM 프롬프트 생성 시 활용)';
COMMENT ON COLUMN public.features.name IS '기능명 (예: 사용자 발화, 변수 저장)';
COMMENT ON COLUMN public.features.reference_path IS 'Master JSON 상의 경로 (예: dialogs[0].text)';
COMMENT ON COLUMN public.features.prompt_instruction IS 'LLM에 제공할 지시사항 (예: 사용자와 대화하는 대사를 입력합니다)';

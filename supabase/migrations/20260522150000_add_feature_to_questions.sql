-- Add feature_id to questions table for precise feature-question mapping
-- This enables admin to explicitly link questions to features for automatic mapping

ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS feature_id UUID REFERENCES public.features(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_questions_feature_id
  ON public.questions(feature_id);

-- Add comment for documentation
COMMENT ON COLUMN public.questions.feature_id IS 'Links this question to a feature for automatic value mapping in dialogflow-generator';

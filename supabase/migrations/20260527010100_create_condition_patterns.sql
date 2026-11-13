-- supabase/migrations/20260527_create_condition_patterns.sql
CREATE TABLE IF NOT EXISTS public.condition_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pattern_name TEXT UNIQUE NOT NULL,
  pattern_description TEXT,

  natural_language_examples TEXT[] DEFAULT '{}',
  generated_code TEXT NOT NULL,

  pattern_type TEXT DEFAULT 'condition' CHECK (pattern_type IN ('condition', 'value_transform')),
  complexity_score INT DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_learned_at TIMESTAMP WITH TIME ZONE,
  usage_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_condition_patterns_created_at ON public.condition_patterns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_condition_patterns_pattern_name ON public.condition_patterns(pattern_name);

COMMENT ON TABLE public.condition_patterns IS 'Learned patterns for natural language condition conversion (global policy)';
COMMENT ON COLUMN public.condition_patterns.generated_code IS 'JavaScript code converted from natural language';
COMMENT ON COLUMN public.condition_patterns.complexity_score IS 'Used for priority sorting';

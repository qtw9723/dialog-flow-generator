-- supabase/migrations/20260527_create_field_value_mappings.sql
CREATE TABLE IF NOT EXISTS public.field_value_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id UUID REFERENCES public.dialogflow_references(id) ON DELETE CASCADE,

  field_path TEXT NOT NULL,
  condition_natural_language TEXT NOT NULL,
  condition_code TEXT,

  value_type TEXT DEFAULT 'static' CHECK (value_type IN ('static', 'expression')),
  value_content TEXT NOT NULL,

  pattern_id UUID REFERENCES public.condition_patterns(id) ON DELETE SET NULL,

  priority INT DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_value_mappings_reference_id ON public.field_value_mappings(reference_id);
CREATE INDEX IF NOT EXISTS idx_field_value_mappings_field_path ON public.field_value_mappings(field_path);
CREATE INDEX IF NOT EXISTS idx_field_value_mappings_priority ON public.field_value_mappings(priority);
CREATE INDEX IF NOT EXISTS idx_field_value_mappings_pattern_id ON public.field_value_mappings(pattern_id);

COMMENT ON TABLE public.field_value_mappings IS 'Conditional value assignments for fields';
COMMENT ON COLUMN public.field_value_mappings.condition_code IS 'Auto-generated JavaScript condition code';
COMMENT ON COLUMN public.field_value_mappings.priority IS 'Lower value = higher priority';

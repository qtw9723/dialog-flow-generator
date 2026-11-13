-- supabase/migrations/20260527_create_field_schemas.sql
CREATE TABLE IF NOT EXISTS public.field_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id UUID REFERENCES public.dialogflow_references(id) ON DELETE CASCADE,
  feature_id UUID REFERENCES public.features(id) ON DELETE SET NULL,

  field_path TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('enum', 'string', 'number', 'boolean', 'date')),

  -- enum 타입
  enum_values TEXT[] DEFAULT '{}',

  -- number 타입
  min_value NUMERIC,
  max_value NUMERIC,

  -- string 타입
  pattern TEXT,
  min_length INT,
  max_length INT,

  required BOOLEAN DEFAULT true,
  default_value TEXT,
  description TEXT,

  order_index INT DEFAULT 0,
  enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_schemas_reference_id ON public.field_schemas(reference_id);
CREATE INDEX IF NOT EXISTS idx_field_schemas_feature_id ON public.field_schemas(feature_id);

COMMENT ON TABLE public.field_schemas IS 'Required field schemas for JSON generation';
COMMENT ON COLUMN public.field_schemas.field_path IS 'JSON path like "ddd.ooo.type"';
COMMENT ON COLUMN public.field_schemas.enum_values IS 'Allowed values for enum type';

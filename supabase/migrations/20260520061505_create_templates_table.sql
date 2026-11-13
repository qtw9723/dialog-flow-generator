-- Create templates table for reusable scenario templates
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster name lookups
CREATE INDEX idx_templates_name ON public.templates(name);

-- Add table and column comments
COMMENT ON TABLE public.templates IS 'Reusable templates for scenario-based questions';
COMMENT ON COLUMN public.templates.fields IS 'Array of field definitions: [{name, type, required}, ...]';

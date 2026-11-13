-- Add fields column to questions table to support STRUCTURED input type
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.questions.fields IS 'Array of field definitions for STRUCTURED input type: [{name: string, type: "text" | "textarea"}, ...]';

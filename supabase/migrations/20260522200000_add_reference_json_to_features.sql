-- Add reference_json column to features table to store example JSON implementation
ALTER TABLE public.features
ADD COLUMN IF NOT EXISTS reference_json JSONB;

-- Add comment
COMMENT ON COLUMN public.features.reference_json IS 'Example JSON showing how this feature is implemented - reference implementation';

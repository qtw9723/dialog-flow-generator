-- Add reference_ids column to features table to track which references use this feature
ALTER TABLE public.features
ADD COLUMN IF NOT EXISTS reference_ids UUID[] DEFAULT '{}';

-- Add comment
COMMENT ON COLUMN public.features.reference_ids IS 'Array of reference IDs that use this feature';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_features_reference_ids ON public.features USING GIN(reference_ids);

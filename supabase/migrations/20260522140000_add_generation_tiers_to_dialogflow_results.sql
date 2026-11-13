-- Add generation_tiers column to dialogflow_results table
ALTER TABLE public.dialogflow_results
ADD COLUMN IF NOT EXISTS generation_tiers JSONB DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.dialogflow_results.generation_tiers IS 'Metadata about rule execution across three tiers (structure, rules applied, counts)';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_dialogflow_results_generation_tiers
  ON public.dialogflow_results USING GIN (generation_tiers);

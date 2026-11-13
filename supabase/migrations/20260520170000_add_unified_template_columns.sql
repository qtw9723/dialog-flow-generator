-- Add unified template columns to dialogflow_references
ALTER TABLE dialogflow_references
ADD COLUMN IF NOT EXISTS unified_generation_template JSONB,
ADD COLUMN IF NOT EXISTS unified_template_status TEXT DEFAULT 'pending';

-- Add comments
COMMENT ON COLUMN dialogflow_references.unified_generation_template IS 'Unified template combining all references + master analyzed together';
COMMENT ON COLUMN dialogflow_references.unified_template_status IS 'Status of unified template: pending, completed, invalid';

-- Create index for finding completed unified templates
CREATE INDEX IF NOT EXISTS idx_dialogflow_references_unified_status ON dialogflow_references(unified_template_status);

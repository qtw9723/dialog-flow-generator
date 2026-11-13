-- Add master reference management fields to dialogflow_references table
ALTER TABLE dialogflow_references
ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS master_reference_id UUID REFERENCES dialogflow_references(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS schema_validation_status TEXT DEFAULT 'pending';

-- Add comments
COMMENT ON COLUMN dialogflow_references.is_master IS 'TRUE if this reference defines the master JSON schema';
COMMENT ON COLUMN dialogflow_references.master_reference_id IS 'Reference to the active master schema this reference conforms to';
COMMENT ON COLUMN dialogflow_references.schema_validation_status IS 'Validation status against master: pending, valid, invalid';

-- Create index for finding master reference
CREATE INDEX IF NOT EXISTS idx_dialogflow_references_is_master ON dialogflow_references(is_master) WHERE is_master = true;

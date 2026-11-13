-- Add basic_rules columns to dialogflow_references table
ALTER TABLE dialogflow_references
ADD COLUMN IF NOT EXISTS basic_rules JSONB,
ADD COLUMN IF NOT EXISTS basic_rules_version TEXT,
ADD COLUMN IF NOT EXISTS basic_rules_status TEXT DEFAULT 'pending';

-- Create index for faster queries by status
CREATE INDEX IF NOT EXISTS idx_dialogflow_references_basic_rules_status
  ON dialogflow_references(basic_rules_status);

-- Add comments for documentation
COMMENT ON COLUMN dialogflow_references.basic_rules IS
  'BasicRules object extracted from Master: required fields, type definitions, structural patterns, validation';
COMMENT ON COLUMN dialogflow_references.basic_rules_version IS
  'Hash or version ID for rule set (changes when Master JSON changes)';
COMMENT ON COLUMN dialogflow_references.basic_rules_status IS
  'Status of basic rules extraction: pending, completed, invalid';

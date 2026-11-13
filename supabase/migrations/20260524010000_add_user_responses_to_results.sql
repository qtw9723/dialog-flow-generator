-- Add user_responses column to dialogflow_results table
-- Stores the user's raw responses for audit trail and debugging

ALTER TABLE dialogflow_results
ADD COLUMN IF NOT EXISTS user_responses JSONB;

-- Add comment
COMMENT ON COLUMN dialogflow_results.user_responses IS 'User responses in original format for reference and audit';

-- Create index for easier querying
CREATE INDEX IF NOT EXISTS idx_dialogflow_results_reference ON dialogflow_results(reference_id);

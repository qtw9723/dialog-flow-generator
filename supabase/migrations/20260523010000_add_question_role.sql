-- Add question_role column to track the role/purpose of each question
-- This helps in generating more accurate prompts during JSON generation

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS question_role TEXT
CHECK (question_role IN ('required_context', 'optional_context', 'constraint', 'intent', 'preference'))
DEFAULT 'required_context';

-- Create index for faster filtering by role
CREATE INDEX IF NOT EXISTS idx_questions_role ON questions(question_role);

-- Add comment explaining the roles
COMMENT ON COLUMN questions.question_role IS
'Role of this question in generation:
- required_context: Essential information that must be provided
- optional_context: Additional information that may be provided
- constraint: Rules/requirements that must be followed
- intent: User''s purpose or intention
- preference: Optional settings or preferences';

-- Update the input_type check constraint to allow 'structured' type
-- Drop the existing constraint
ALTER TABLE public.questions
DROP CONSTRAINT IF EXISTS questions_input_type_check;

-- Add the updated constraint that includes 'structured'
ALTER TABLE public.questions
ADD CONSTRAINT questions_input_type_check
CHECK (input_type IN ('text', 'textarea', 'select', 'structured'));

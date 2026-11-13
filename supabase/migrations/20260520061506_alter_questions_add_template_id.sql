-- Add template_id foreign key to questions table
ALTER TABLE public.questions
ADD COLUMN template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL;

-- Update the input_type check constraint to include 'templated'
ALTER TABLE public.questions
DROP CONSTRAINT IF EXISTS questions_input_type_check;

ALTER TABLE public.questions
ADD CONSTRAINT questions_input_type_check
CHECK (input_type IN ('text', 'textarea', 'select', 'structured', 'templated'));

-- Create index for faster template lookups
CREATE INDEX idx_questions_template_id ON public.questions(template_id);

-- Add column comment
COMMENT ON COLUMN public.questions.template_id IS 'Reference to template for templated questions';

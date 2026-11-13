-- Create solution_rules table to manage:
-- - Solution Rules
-- - System Variables
-- - Node Usage Rules
-- - Variable Usage Rules
-- All with flexible JSONB content structure

CREATE TABLE IF NOT EXISTS solution_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Category classification (Solution Rule, System Variable, Node Usage Rule, Variable Usage Rule)
  category TEXT NOT NULL,

  -- Title and description
  title TEXT NOT NULL,
  description TEXT,

  -- Flexible JSON content for rule definitions
  content JSONB NOT NULL,

  -- Display and sorting order
  order_index INTEGER DEFAULT 0,

  -- Timestamp tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_category CHECK (category IN (
    'Solution Rule',
    'System Variable',
    'Node Usage Rule',
    'Variable Usage Rule'
  ))
);

-- Add comments for documentation
COMMENT ON TABLE solution_rules IS 'Centralized storage for solution rules, system variables, and usage rules with flexible JSONB content';
COMMENT ON COLUMN solution_rules.id IS 'Unique identifier for the rule (UUID)';
COMMENT ON COLUMN solution_rules.category IS 'Category type: Solution Rule, System Variable, Node Usage Rule, or Variable Usage Rule';
COMMENT ON COLUMN solution_rules.title IS 'Display title for the rule';
COMMENT ON COLUMN solution_rules.description IS 'Optional description of the rule purpose and usage';
COMMENT ON COLUMN solution_rules.content IS 'Flexible JSONB structure storing rule-specific data (schema depends on category)';
COMMENT ON COLUMN solution_rules.order_index IS 'Display order for rules within the same category';
COMMENT ON COLUMN solution_rules.created_at IS 'Timestamp when the rule was created';
COMMENT ON COLUMN solution_rules.updated_at IS 'Timestamp when the rule was last updated';

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_solution_rules_category ON solution_rules(category);
CREATE INDEX IF NOT EXISTS idx_solution_rules_order ON solution_rules(order_index);
CREATE INDEX IF NOT EXISTS idx_solution_rules_category_order ON solution_rules(category, order_index);

-- Create index for JSONB content search (supports containment queries)
CREATE INDEX IF NOT EXISTS idx_solution_rules_content_gin ON solution_rules USING GIN (content);

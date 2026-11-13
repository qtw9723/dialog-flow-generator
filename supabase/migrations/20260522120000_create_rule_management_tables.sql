-- ============================================
-- Create Rule Management System Tables
-- ============================================
-- This migration creates the rule management infrastructure for the DialogFlow POC system
-- Tier 2: Field definitions to guide LLM structure creation
-- Tier 3: Rule templates for quick rule creation and value generators for user-created rules

-- ============================================
-- 1. rule_field_definitions Table
-- ============================================
-- Tier 2 field definitions that guide LLM structure generation
-- Defines the schema and constraints for JSON paths in rule configurations

CREATE TABLE rule_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id UUID NOT NULL REFERENCES dialogflow_references(id) ON DELETE CASCADE,
  json_path TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL,
  is_required BOOLEAN DEFAULT true,
  description TEXT,
  enum_values TEXT[],
  pattern TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

COMMENT ON TABLE rule_field_definitions IS 'Tier 2 field definitions that guide LLM structure generation for rules';
COMMENT ON COLUMN rule_field_definitions.id IS 'Unique identifier for the field definition';
COMMENT ON COLUMN rule_field_definitions.reference_id IS 'Reference to the dialogflow_reference this definition belongs to';
COMMENT ON COLUMN rule_field_definitions.json_path IS 'JSON path where this field should appear in rule config';
COMMENT ON COLUMN rule_field_definitions.field_name IS 'Human-readable name of the field';
COMMENT ON COLUMN rule_field_definitions.field_type IS 'Data type of the field (string, number, boolean, array, object)';
COMMENT ON COLUMN rule_field_definitions.is_required IS 'Whether this field is mandatory in the rule config';
COMMENT ON COLUMN rule_field_definitions.description IS 'Description of what this field is used for';
COMMENT ON COLUMN rule_field_definitions.enum_values IS 'List of allowed values if field is an enum';
COMMENT ON COLUMN rule_field_definitions.pattern IS 'Regex pattern for string validation';
COMMENT ON COLUMN rule_field_definitions.min_value IS 'Minimum value for numeric fields';
COMMENT ON COLUMN rule_field_definitions.max_value IS 'Maximum value for numeric fields';

CREATE INDEX idx_rule_field_definitions_reference
  ON rule_field_definitions(reference_id);

-- ============================================
-- 2. rule_templates Table
-- ============================================
-- Tier 3 rule templates for quick rule creation
-- Pre-built templates that users can use to quickly generate rules

CREATE TABLE rule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  category TEXT,
  description TEXT,
  example_config JSONB,
  created_at TIMESTAMP DEFAULT now()
);

COMMENT ON TABLE rule_templates IS 'Tier 3 rule templates for quick rule creation and standardization';
COMMENT ON COLUMN rule_templates.id IS 'Unique identifier for the rule template';
COMMENT ON COLUMN rule_templates.name IS 'Template name';
COMMENT ON COLUMN rule_templates.rule_type IS 'Type of rule this template creates';
COMMENT ON COLUMN rule_templates.category IS 'Category for organizing templates';
COMMENT ON COLUMN rule_templates.description IS 'Description of what this template does';
COMMENT ON COLUMN rule_templates.example_config IS 'Example configuration in JSONB format';

-- ============================================
-- 3. rule_value_generators Table
-- ============================================
-- Tier 3 value generation rules created by users
-- Stores the rules that generate dynamic values based on configurations

CREATE TABLE rule_value_generators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id UUID NOT NULL REFERENCES dialogflow_references(id) ON DELETE CASCADE,
  template_id UUID REFERENCES rule_templates(id) ON DELETE SET NULL,
  json_path TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  rule_config JSONB NOT NULL,
  applies_to_question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INT DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

COMMENT ON TABLE rule_value_generators IS 'Tier 3 value generation rules created by users to generate dynamic values';
COMMENT ON COLUMN rule_value_generators.id IS 'Unique identifier for the rule generator';
COMMENT ON COLUMN rule_value_generators.reference_id IS 'Reference to the dialogflow_reference this rule belongs to';
COMMENT ON COLUMN rule_value_generators.template_id IS 'Optional reference to a rule template';
COMMENT ON COLUMN rule_value_generators.json_path IS 'JSON path where the generated value should be placed';
COMMENT ON COLUMN rule_value_generators.rule_type IS 'Type of rule (e.g., conditional, transformation, calculation)';
COMMENT ON COLUMN rule_value_generators.rule_config IS 'Configuration for the rule in JSONB format';
COMMENT ON COLUMN rule_value_generators.applies_to_question_id IS 'Question this rule applies to, if any';
COMMENT ON COLUMN rule_value_generators.order_index IS 'Execution order for multiple rules on same path';
COMMENT ON COLUMN rule_value_generators.enabled IS 'Whether this rule is currently active';

CREATE INDEX idx_rule_value_generators_reference
  ON rule_value_generators(reference_id);

CREATE INDEX idx_rule_value_generators_json_path
  ON rule_value_generators(json_path);

-- ============================================
-- 4. Modify dialogflow_references Table
-- ============================================
-- Add status columns to track field definitions and value generators state

ALTER TABLE dialogflow_references
  ADD COLUMN field_definitions_status TEXT DEFAULT 'pending';

ALTER TABLE dialogflow_references
  ADD COLUMN value_generators_status TEXT DEFAULT 'pending';

COMMENT ON COLUMN dialogflow_references.field_definitions_status IS 'Status of field definitions: pending, in_progress, completed, failed';
COMMENT ON COLUMN dialogflow_references.value_generators_status IS 'Status of value generators: pending, in_progress, completed, failed';

CREATE INDEX idx_dialogflow_references_field_definitions_status
  ON dialogflow_references(field_definitions_status);

CREATE INDEX idx_dialogflow_references_value_generators_status
  ON dialogflow_references(value_generators_status);

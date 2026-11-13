import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { maskApiKeys } from "../_shared/llmError.ts"
import { LLM_MODEL } from "../_shared/llmModel.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

// ============================================================================
// TYPE DEFINITIONS FOR TIER 1: BasicRules Extraction
// ============================================================================

interface FieldType {
  base_type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  is_required: boolean;
  is_array: boolean;
  array_element_type?: FieldType;
  nested_fields?: Record<string, FieldType>;
  sample_value?: any;
}

interface NestedPath {
  path: string;
  depth: number;
  parent_array_path?: string;
  is_leaf: boolean;
}

interface ArrayPattern {
  array_path: string;
  element_type: 'object' | 'string' | 'number';
  min_elements?: number;
  max_elements?: number;
  required_element_fields?: string[];
}

interface FieldConstraint {
  path: string;
  type: string;
  nullable: boolean;
  unique?: boolean;
  pattern?: string;
  enum?: string[];
  description: string;
}

interface BasicRules {
  schema: {
    required_fields: string[];
    nested_structure: NestedPath[];
    array_patterns: ArrayPattern[];
    field_constraints: FieldConstraint[];
  };

  type_definitions: {
    [jsonPath: string]: FieldType;
  };

  structural_rules: {
    max_array_depths: Record<string, number>;
    required_nested_objects: string[];
    default_structures: Record<string, any>;
  };

  validation: {
    field_format_rules: Record<string, RegExp>;
    enum_values: Record<string, string[]>;
    min_max_values: Record<string, {min?: number, max?: number}>;
  };
}

/**
 * Fetch master reference and all child references for unified learning
 */
async function getAllReferencesWithMaster(
  supabase: any,
  masterId: string
): Promise<{ master: any; children: any[] }> {
  // Fetch master
  const { data: masterData, error: masterError } = await supabase
    .from("dialogflow_references")
    .select("*")
    .eq("id", masterId)
    .single()

  if (masterError || !masterData) {
    throw new Error(`Failed to fetch master reference: ${masterError?.message}`)
  }

  // Fetch all children
  const { data: childrenData, error: childrenError } = await supabase
    .from("dialogflow_references")
    .select("*")
    .eq("master_reference_id", masterId)

  if (childrenError) {
    console.warn("[learn-rules] Warning fetching children:", childrenError)
  }

  return {
    master: masterData,
    children: childrenData || []
  }
}

/**
 * Fetch enabled global features from the features table
 * Features are now global and apply to all references
 */
async function getEnabledFeatures(
  supabase: any
): Promise<any[]> {
  const { data, error } = await supabase
    .from("features")
    .select("*")
    .eq("enabled", true)
    .order("order_index", { ascending: true })

  if (error) {
    console.warn("[learn-rules] Warning fetching global features:", error.message)
    return []
  }

  return data || []
}

/**
 * Extract detailed schema info with full path information and structure
 * This provides accurate depth, indices, and type information for mappings
 */
function extractDetailedSchemaInfo(jsonData: any): { paths: any; structure: string } {
  const paths: any = {}
  const structureLines: string[] = []

  // Recursively extract complete paths with structural context
  const extractPaths = (obj: any, prefix = "", depth = 0, isArrayElement = false) => {
    if (!obj || typeof obj !== "object") return

    for (const key in obj) {
      const value = obj[key]
      let fullPath = prefix ? `${prefix}.${key}` : key

      // Create indentation for structure visualization
      const indent = "  ".repeat(depth)

      if (Array.isArray(value)) {
        // Array notation
        if (value.length > 0) {
          const elementPath = `${fullPath}[0]` // First element path
          paths[elementPath] = {
            type: "array_element",
            depth: depth,
            arrayPath: fullPath,
            elementType: typeof value[0]
          }
          structureLines.push(`${indent}${fullPath}[] (array of ${typeof value[0]})`)

          // Extract from first element
          if (typeof value[0] === "object") {
            extractPaths(value[0], elementPath, depth + 1, true)
          }
        } else {
          structureLines.push(`${indent}${fullPath}[] (empty array)`)
        }
      } else if (typeof value === "object" && value !== null) {
        paths[fullPath] = {
          type: "object",
          depth: depth
        }
        structureLines.push(`${indent}${fullPath}: {object}`)
        extractPaths(value, fullPath, depth + 1)
      } else {
        paths[fullPath] = {
          type: typeof value,
          depth: depth,
          sampleValue: typeof value === "string" ? value.substring(0, 50) : value
        }
        const sample = typeof value === "string" ? ` (예: "${value.substring(0, 30)}")` : ""
        structureLines.push(`${indent}${fullPath}: ${typeof value}${sample}`)
      }
    }
  }

  extractPaths(jsonData)

  return {
    paths,
    structure: structureLines.join("\n")
  }
}

/**
 * Extract essential schema info to reduce token usage (legacy)
 */
function extractSchemaInfo(jsonData: any): any {
  const info: any = {}

  // Recursively extract keys and types (not values)
  const extractKeys = (obj: any, prefix = "") => {
    if (!obj || typeof obj !== "object") return

    for (const key in obj) {
      const fullPath = prefix ? `${prefix}.${key}` : key
      const value = obj[key]

      if (Array.isArray(value)) {
        info[`${fullPath}[]`] = "array"
        if (value.length > 0 && typeof value[0] === "object") {
          extractKeys(value[0], `${fullPath}[]`)
        }
      } else if (typeof value === "object" && value !== null) {
        info[fullPath] = "object"
        extractKeys(value, fullPath)
      } else {
        info[fullPath] = typeof value
      }
    }
  }

  extractKeys(jsonData)
  return info
}

// ============================================================================
// TIER 1: HELPER FUNCTIONS FOR BasicRules EXTRACTION
// ============================================================================

/**
 * Infer the base type of a value
 * Returns: 'string' | 'number' | 'boolean' | 'object' | 'array'
 */
function inferTypeFromValue(value: any): 'string' | 'number' | 'boolean' | 'object' | 'array' {
  if (value === null || value === undefined) return 'string' // Default for null/undefined
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value as 'string' | 'number' | 'boolean'
}

/**
 * Extract all paths from an object recursively
 * Returns array of paths like: ['id', 'name', 'dialogs', 'dialogs[0]', 'dialogs[0].id', ...]
 */
function extractAllPaths(
  obj: any,
  prefix: string = '',
  visited: Set<any> = new Set(),
  maxDepth: number = 10,
  currentDepth: number = 0
): string[] {
  const paths: string[] = []

  // Prevent infinite recursion
  if (!obj || typeof obj !== 'object' || currentDepth >= maxDepth || visited.has(obj)) {
    return paths
  }

  visited.add(obj)

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue

    const value = obj[key]
    const fullPath = prefix ? `${prefix}.${key}` : key

    paths.push(fullPath)

    if (Array.isArray(value)) {
      // For arrays, add the indexed element path
      if (value.length > 0) {
        const elementPath = `${fullPath}[0]`
        paths.push(elementPath)

        // If first element is an object, recurse into it
        if (typeof value[0] === 'object' && value[0] !== null) {
          const nestedPaths = extractAllPaths(
            value[0],
            elementPath,
            visited,
            maxDepth,
            currentDepth + 1
          )
          paths.push(...nestedPaths)
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      // For objects, recurse
      const nestedPaths = extractAllPaths(
        value,
        fullPath,
        visited,
        maxDepth,
        currentDepth + 1
      )
      paths.push(...nestedPaths)
    }
  }

  return paths
}

/**
 * Detect pattern in string values
 * Returns object with detected pattern (regex) and/or enum values
 */
function detectPattern(value: string): { pattern?: string; enum?: string[] } {
  if (!value || typeof value !== 'string') return {}

  const result: { pattern?: string; enum?: string[] } = {}

  // UUID pattern (36 chars, contains dashes and hex)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    result.pattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  }
  // ISO 8601 date/datetime
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    result.pattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}'
  }
  // Email pattern
  else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    result.pattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
  }
  // URL pattern
  else if (/^https?:\/\//.test(value)) {
    result.pattern = '^https?:\\/\\/'
  }

  return result
}

/**
 * Build a FieldType definition for a given value
 */
function buildTypeDefinition(value: any, path: string): FieldType {
  const baseType = inferTypeFromValue(value)

  const fieldType: FieldType = {
    base_type: baseType,
    is_required: true, // Will be determined by context
    is_array: Array.isArray(value),
    sample_value: value === null ? undefined : (typeof value === 'string' ? value.substring(0, 100) : value)
  }

  // For arrays, determine element type
  if (Array.isArray(value) && value.length > 0) {
    const elementType = inferTypeFromValue(value[0])
    fieldType.array_element_type = {
      base_type: elementType,
      is_required: true,
      is_array: false,
      sample_value: typeof value[0] === 'string' ? value[0].substring(0, 100) : value[0]
    }
  }

  // For objects, build nested fields
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const nestedFields: Record<string, FieldType> = {}
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        nestedFields[key] = buildTypeDefinition(value[key], `${path}.${key}`)
      }
    }
    fieldType.nested_fields = nestedFields
  }

  return fieldType
}

/**
 * Extract array patterns from an object
 * Returns array of ArrayPattern objects
 */
function extractArrayPatterns(obj: any, prefix: string = '', visited: Set<any> = new Set()): ArrayPattern[] {
  const patterns: ArrayPattern[] = []

  if (!obj || typeof obj !== 'object' || visited.has(obj)) {
    return patterns
  }

  visited.add(obj)

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue

    const value = obj[key]
    const fullPath = prefix ? `${prefix}.${key}` : key

    if (Array.isArray(value)) {
      const elementType = value.length > 0 ? inferTypeFromValue(value[0]) : 'string'

      const pattern: ArrayPattern = {
        array_path: fullPath,
        element_type: elementType as 'object' | 'string' | 'number',
        min_elements: value.length > 0 ? 1 : 0,
        max_elements: value.length
      }

      // For arrays of objects, extract required fields from first element
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        pattern.required_element_fields = Object.keys(value[0])

        // Recurse into first element
        const nestedPatterns = extractArrayPatterns(
          value[0],
          `${fullPath}[0]`,
          visited
        )
        patterns.push(...nestedPatterns)
      }

      patterns.push(pattern)
    } else if (typeof value === 'object' && value !== null) {
      // Recurse into objects
      const nestedPatterns = extractArrayPatterns(value, fullPath, visited)
      patterns.push(...nestedPatterns)
    }
  }

  return patterns
}

/**
 * Build NestedPath objects from an object
 */
function buildNestedPaths(
  obj: any,
  prefix: string = '',
  depth: number = 0,
  visited: Set<any> = new Set(),
  parentArrayPath?: string
): NestedPath[] {
  const paths: NestedPath[] = []

  if (!obj || typeof obj !== 'object' || visited.has(obj) || depth > 10) {
    return paths
  }

  visited.add(obj)

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue

    const value = obj[key]
    const fullPath = prefix ? `${prefix}.${key}` : key
    const isLeaf = !(typeof value === 'object' && value !== null) || (Array.isArray(value) && value.length === 0)

    const nestedPath: NestedPath = {
      path: fullPath,
      depth,
      is_leaf: isLeaf
    }

    if (parentArrayPath) {
      nestedPath.parent_array_path = parentArrayPath
    }

    paths.push(nestedPath)

    if (Array.isArray(value) && value.length > 0) {
      // Add array element path
      const elementPath = `${fullPath}[0]`
      paths.push({
        path: elementPath,
        depth: depth,
        parent_array_path: fullPath,
        is_leaf: !(typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0]))
      })

      // Recurse into first element if it's an object
      if (typeof value[0] === 'object' && value[0] !== null) {
        const nestedPaths = buildNestedPaths(
          value[0],
          elementPath,
          depth + 1,
          visited,
          fullPath
        )
        paths.push(...nestedPaths)
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recurse into objects
      const nestedPaths = buildNestedPaths(
        value,
        fullPath,
        depth + 1,
        visited,
        parentArrayPath
      )
      paths.push(...nestedPaths)
    }
  }

  return paths
}

/**
 * Build type definitions for all paths in an object
 */
function buildTypeDefinitions(
  obj: any,
  prefix: string = '',
  visited: Set<any> = new Set()
): Record<string, FieldType> {
  const definitions: Record<string, FieldType> = {}

  if (!obj || typeof obj !== 'object' || visited.has(obj)) {
    return definitions
  }

  visited.add(obj)

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue

    const value = obj[key]
    const fullPath = prefix ? `${prefix}.${key}` : key

    definitions[fullPath] = buildTypeDefinition(value, fullPath)

    if (Array.isArray(value) && value.length > 0) {
      const elementPath = `${fullPath}[0]`
      definitions[elementPath] = buildTypeDefinition(value[0], elementPath)

      // Recurse into array element
      if (typeof value[0] === 'object' && value[0] !== null) {
        const nestedDefinitions = buildTypeDefinitions(
          value[0],
          elementPath,
          visited
        )
        Object.assign(definitions, nestedDefinitions)
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recurse into objects
      const nestedDefinitions = buildTypeDefinitions(value, fullPath, visited)
      Object.assign(definitions, nestedDefinitions)
    }
  }

  return definitions
}

/**
 * Build FieldConstraint objects for a path
 */
function buildFieldConstraints(obj: any, prefix: string = '', visited: Set<any> = new Set()): FieldConstraint[] {
  const constraints: FieldConstraint[] = []

  if (!obj || typeof obj !== 'object' || visited.has(obj)) {
    return constraints
  }

  visited.add(obj)

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue

    const value = obj[key]
    const fullPath = prefix ? `${prefix}.${key}` : key

    const constraint: FieldConstraint = {
      path: fullPath,
      type: inferTypeFromValue(value),
      nullable: value === null || value === undefined,
      description: `Field: ${fullPath}`
    }

    // Detect patterns in strings
    if (typeof value === 'string') {
      const pattern = detectPattern(value)
      if (pattern.pattern) {
        constraint.pattern = pattern.pattern
      }
    }

    constraints.push(constraint)

    // Recurse for nested structures
    if (Array.isArray(value) && value.length > 0) {
      const elementPath = `${fullPath}[0]`
      if (typeof value[0] === 'object' && value[0] !== null) {
        const nestedConstraints = buildFieldConstraints(
          value[0],
          elementPath,
          visited
        )
        constraints.push(...nestedConstraints)
      }
    } else if (typeof value === 'object' && value !== null) {
      const nestedConstraints = buildFieldConstraints(value, fullPath, visited)
      constraints.push(...nestedConstraints)
    }
  }

  return constraints
}

// ============================================================================
// TIER 1: MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract BasicRules from a Master JSON sample
 *
 * Analyzes the master JSON structure to extract:
 * - Required fields and nested paths
 * - Field type definitions with sample values
 * - Array patterns and depths
 * - Validation rules and constraints
 *
 * @param masterJson - The master JSON object to analyze
 * @returns BasicRules object with comprehensive structural information
 */
function extractBasicRules(masterJson: any): BasicRules {
  const visited = new Set<any>()

  // Extract all required fields (top-level keys)
  const requiredFields = masterJson && typeof masterJson === 'object'
    ? Object.keys(masterJson)
    : []

  // Build nested paths
  const nestedStructure = buildNestedPaths(masterJson, '', 0, new Set())

  // Extract array patterns
  const arrayPatterns = extractArrayPatterns(masterJson, '', new Set())

  // Build field constraints
  const fieldConstraints = buildFieldConstraints(masterJson, '', new Set())

  // Build complete type definitions
  const typeDefinitions = buildTypeDefinitions(masterJson, '', new Set())

  // Calculate max array depths
  const maxArrayDepths: Record<string, number> = {}
  for (const pattern of arrayPatterns) {
    const arrayPath = pattern.array_path
    maxArrayDepths[arrayPath] = 1 // Single-level arrays from sample
  }

  // Identify required nested objects
  const requiredNestedObjects: string[] = []
  for (const path of nestedStructure) {
    if (path.is_leaf === false && path.path.includes('.')) {
      // It's a nested object (contains dot) and not a leaf
      const parentPath = path.path.split('.').slice(0, -1).join('.')
      if (!requiredNestedObjects.includes(parentPath)) {
        requiredNestedObjects.push(parentPath)
      }
    }
  }

  // Build default structures (templates for complex objects)
  const defaultStructures: Record<string, any> = {}
  for (const pattern of arrayPatterns) {
    if (pattern.element_type === 'object' && pattern.required_element_fields) {
      const template: any = {}
      for (const field of pattern.required_element_fields) {
        template[field] = null
      }
      defaultStructures[pattern.array_path] = [template]
    }
  }

  // Build validation rules
  const fieldFormatRules: Record<string, RegExp> = {}
  const enumValues: Record<string, string[]> = {}
  const minMaxValues: Record<string, {min?: number, max?: number}> = {}

  for (const constraint of fieldConstraints) {
    if (constraint.pattern) {
      fieldFormatRules[constraint.path] = new RegExp(constraint.pattern)
    }
    if (constraint.enum) {
      enumValues[constraint.path] = constraint.enum
    }
  }

  return {
    schema: {
      required_fields: requiredFields,
      nested_structure: nestedStructure,
      array_patterns: arrayPatterns,
      field_constraints: fieldConstraints
    },
    type_definitions: typeDefinitions,
    structural_rules: {
      max_array_depths: maxArrayDepths,
      required_nested_objects: requiredNestedObjects,
      default_structures: defaultStructures
    },
    validation: {
      field_format_rules: fieldFormatRules,
      enum_values: enumValues,
      min_max_values: minMaxValues
    }
  }
}

/**
 * Build structure prompt including feature information for better LLM understanding
 * Features help the LLM understand what capabilities are available for the schema
 */
async function buildStructurePromptWithFeatures(
  masterJson: any,
  features: any[]
): Promise<string> {
  // Format features as markdown for inclusion in prompt
  const featuresList = features
    .map((f, idx) => {
      return `${idx + 1}. **${f.name}** (${f.category})
   - 경로: \`${f.reference_path}\`
   - 설명: ${f.description}
   - 지시사항: ${f.prompt_instruction}
   - 예시: ${f.example_value}`
    })
    .join("\n\n")

  const prompt = `당신은 프로젝트의 JSON 스키마를 분석하는 전문가입니다.

## Master JSON 구조
\`\`\`json
${JSON.stringify(masterJson, null, 2)}
\`\`\`

## 이 프로젝트에서 사용 가능한 기능들

${featuresList.length > 0 ? featuresList : "정의된 기능이 없습니다."}

## 작업
위 Master JSON 구조를 분석하고, 각 기능이 JSON의 어느 부분에 매핑되는지 파악해주세요.

이를 기반으로 다음 단계에서 사용자 입력에 따라 JSON을 생성할 것입니다.`

  return prompt
}

/**
 * Build unified prompt that maps child data to available master functions
 * Master = the exact schema structure that output MUST follow (with precise paths and depths)
 * Children = use cases/data examples to map into master structure
 * Features = available capabilities to enhance LLM understanding
 * CRITICAL: Provide detailed path information so mappings are 100% accurate
 */
/**
 * Build scenario-based feature identification prompt
 */
function buildScenarioBasedPrompt(
  masterJson: any,
  scenarioDescription: string,
  features: any[]
): string {
  const featuresInfo = features
    .map(f => `- ${f.name} (${f.category}): ${f.description}`)
    .join("\n")

  const masterJsonStr = JSON.stringify(masterJson, null, 2)

  return `
당신은 JSON 기반 시스템의 아키텍처 설계 전문가입니다.

## 시나리오 설명
사용자의 요구사항:
\`\`\`
${scenarioDescription}
\`\`\`

## Master JSON 구조
\`\`\`json
${masterJsonStr}
\`\`\`

## 사용 가능한 기능들 (Features)
${featuresInfo}

## 작업
위 시나리오를 분석하고 다음을 수행해주세요:

1. **필요한 기능 식별**: 시나리오를 구현하기 위해 어떤 기능들이 필요한가?
2. **기능별 목적 설명**: 각 기능이 시나리오에서 어떤 역할을 하는가?
3. **JSON 구조 매핑**: Master JSON의 어느 부분에 각 기능을 매핑해야 하는가?

응답 형식 (JSON만):
\`\`\`json
{
  "scenario_analysis": "시나리오에 대한 간단한 분석",
  "identified_features": [
    {
      "name": "기능명",
      "purpose": "이 시나리오에서의 역할",
      "reference_paths": ["매핑될 JSON 경로들"]
    }
  ]
}
\`\`\`

JSON 객체만 반환하세요 (마크다운 없음).
`
}

function buildUnifiedPrompt(master: any, children: any[], features: any[] = []): string {
  // Extract DETAILED master structure with full path information
  const masterAnalysis = extractDetailedSchemaInfo(master.json_data)

  // Extract child data schemas
  const childDataSchemas = children.map(child => ({
    name: child.name,
    analysis: extractDetailedSchemaInfo(child.json_data)
  }))

  // Include full sample of master JSON structure
  const masterJsonSample = JSON.stringify(master.json_data, null, 2)

  // Format features for inclusion in prompt
  const featuresSection = features.length > 0 ? `

=== 사용 가능한 기능들 (Features) ===

다음 기능들이 Master JSON의 특정 경로에 매핑될 수 있습니다:

${features
  .map((f, idx) => {
    return `${idx + 1}. **${f.name}** (${f.category})
   - 경로: \`${f.reference_path}\`
   - 설명: ${f.description}
   - 지시사항: ${f.prompt_instruction}
   - 예시: ${f.example_value}`
  })
  .join("\n\n")}

이 기능들을 고려하여 더 정확한 매핑을 생성해주세요.` : ""

  let prompt = `당신은 사용자 입력 데이터를 특정 Master JSON 스키마로 변환하는 필드 매핑을 만드는 전문가입니다.

=== MASTER JSON 스키마 (생성되는 JSON이 반드시 이 구조를 따라야 함) ===

Master JSON의 정확한 구조:
${masterAnalysis.structure}

Master JSON 완전한 예시:
${masterJsonSample}

사용 가능한 모든 Master 스키마 경로 (매핑 대상):
${JSON.stringify(masterAnalysis.paths, null, 2)}${featuresSection}

=== 사용자 입력 데이터 구조 (매핑 대상) ===
`

  childDataSchemas.forEach((child, idx) => {
    prompt += `
참고자료 ${idx + 1} (${child.name}):
${child.analysis.structure}

경로 상세 정보:
${JSON.stringify(child.analysis.paths, null, 2)}
`
  })

  prompt += `

=== 매핑 작업 ===

TASK: 사용자 입력 필드를 Master 스키마의 정확한 경로로 매핑하기

◎ 절대 규칙 (100% 준수해야 함):
1. 모든 매핑은 "Master 스키마 경로"에 존재하는 경로만 사용
2. 각 사용자 필드는 정확히 하나의 Master 경로로만 매핑
3. Master에 없는 경로는 절대 생성하지 않기 (생략하기)
4. 배열 인덱스 정확히: dialogs[0], dialogs[1] 등 구체적인 인덱스 사용
5. 깊이(depth)와 변수명이 정확하게 일치해야 함
6. 생성되는 JSON은 Master 스키마와 100% 동일한 구조

◎ 예시 (정확성 참고):
잘못된 매핑: "필드1" → "dialogs.nodes.label"  (경로가 애매함)
올바른 매핑: "필드1" → "dialogs[0].nodes[0].label"  (구체적이고 정확함)

반드시 이 JSON 형식만 반환 (마크다운 없음):
{
  "mappings": {
    "사용자_필드_또는_질문ID": "master.schema.path[index].field.name",
    "다른_필드": "dialogs[0].nodes[0].label"
  },
  "rules": {
    "master.schema.path": "이 경로의 데이터 변환 규칙"
  },
  "instructions": "Master JSON을 생성하기 위한 전략. 어떤 사용자 필드가 dialogs/nodes/controls의 정확히 어느 경로로 가는지 명시."
}

중요: Master 스키마 경로만 사용. 새로운 경로 생성 금지.`

  return prompt
}

/**
 * Generate field definitions from JSON structure
 * Recursively traverses the JSON object and creates field definition entries
 */
function generateFieldDefinitionsFromJson(jsonData: any, referenceId: string): any[] {
  const definitions: any[] = []

  function traverse(obj: any, path: string = '') {
    if (obj === null || obj === undefined) return

    if (Array.isArray(obj)) {
      // For arrays, process the first element to get the structure
      if (obj.length > 0) {
        traverse(obj[0], `${path}[]`)
      }
    } else if (typeof obj === 'object') {
      // For objects, process each key
      Object.keys(obj).forEach(key => {
        const newPath = path ? `${path}.${key}` : key
        const value = obj[key]

        if (Array.isArray(value)) {
          if (value.length > 0 && typeof value[0] === 'object') {
            traverse(value[0], `${newPath}[]`)
          } else {
            definitions.push({
              reference_id: referenceId,
              json_path: `${newPath}[]`,
              field_name: key,
              field_type: 'array',
              is_required: true,
              description: `Array field: ${key}`
            })
          }
        } else if (typeof value === 'object') {
          traverse(value, newPath)
        } else {
          // Leaf node - determine field type
          let fieldType = 'string'
          if (typeof value === 'number') fieldType = 'number'
          else if (typeof value === 'boolean') fieldType = 'boolean'

          definitions.push({
            reference_id: referenceId,
            json_path: newPath,
            field_name: key,
            field_type: fieldType,
            is_required: true,
            description: `Field: ${key}`
          })
        }
      })
    }
  }

  traverse(jsonData)
  return definitions
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    })
  }

  try {
    const body = await req.json()
    const { reference_id } = body

    if (!reference_id) {
      return new Response(JSON.stringify({ error: "reference_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!

    console.log("[learn-rules] API Key configured:", !!openaiApiKey)
    console.log("[learn-rules] OpenAI key starts with:", openaiApiKey?.substring(0, 20))

    if (!openaiApiKey) {
      console.error("[learn-rules] OPENAI_API_KEY not configured in Supabase Edge Functions")
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured in Supabase Edge Functions. Please set OPENAI_API_KEY environment variable."
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the reference
    const { data: reference, error: refError } = await supabase
      .from("dialogflow_references")
      .select("*")
      .eq("id", reference_id)
      .single()

    if (refError || !reference) {
      console.error("[learn-rules] Reference not found:", refError)
      return new Response(JSON.stringify({ error: "Reference not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      })
    }

    // Determine if this is a master or a child
    let masterId: string
    if (reference.master_reference_id) {
      // This is a child, use its master
      masterId = reference.master_reference_id
    } else if (!reference.master_reference_id) {
      // This is a master (no parent), use itself
      masterId = reference_id
    } else {
      return new Response(
        JSON.stringify({
          error: "No master reference found. Unified learning requires a master schema.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      )
    }

    console.log(`[learn-rules] Fetching unified system for master: ${masterId}`)

    // Fetch master and all children
    const { master, children } = await getAllReferencesWithMaster(supabase, masterId)

    console.log(
      `[learn-rules] Unified learning: master + ${children.length} children`
    )

    // Fetch enabled global features
    const features = await getEnabledFeatures(supabase).catch(() => {
      console.warn("[learn-rules] Failed to fetch global features, continuing without them")
      return []
    })
    console.log(`[learn-rules] Loaded ${features.length} enabled features`)

    // === Scenario-based feature identification for each reference ===
    // Identify features for master and each child based on their own scenario descriptions
    const referencesToAnalyze = [master, ...children]

    for (const ref of referencesToAnalyze) {
      const refScenario = ref.scenario_description

      if (!refScenario || !refScenario.trim()) {
        console.log(`[learn-rules] No scenario description for reference "${ref.name}", skipping feature identification`)
        continue
      }

      console.log(`[learn-rules] Analyzing scenario for reference "${ref.name}"...`)

      try {
        const scenarioPrompt = buildScenarioBasedPrompt(master.json_data, refScenario, features)
        const estimatedScenarioTokens = Math.ceil(scenarioPrompt.length / 4)
        console.log(`[learn-rules] Scenario prompt length for "${ref.name}": ${scenarioPrompt.length} chars, ~${estimatedScenarioTokens} tokens`)

        const scenarioResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
              model: LLM_MODEL,
              messages: [
                {
                  role: "user",
                  content: scenarioPrompt,
                },
              ],
              max_completion_tokens: 2000,
              temperature: 0.3,
            }),
          }
        )

        const scenarioData = await scenarioResponse.json()
        if (!scenarioResponse.ok) {
          console.warn(`[learn-rules] Scenario analysis API error for "${ref.name}":`, scenarioData)
          continue
        }

        const scenarioResponseText = scenarioData.choices?.[0]?.message?.content || ""
        console.log(`[learn-rules] Scenario response received for "${ref.name}", length: ${scenarioResponseText.length}`)

        // Parse scenario analysis response
        try {
          let scenarioJson = scenarioResponseText
          const scenarioCodeBlockMatch = scenarioResponseText.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (scenarioCodeBlockMatch) {
            scenarioJson = scenarioCodeBlockMatch[1].trim()
          }

          const scenarioJsonMatch = scenarioJson.match(/\{[\s\S]*\}/)
          if (scenarioJsonMatch) {
            const scenarioAnalysis = JSON.parse(scenarioJsonMatch[0])
            const identifiedFeatures = scenarioAnalysis.identified_features || []
            console.log(`[learn-rules] Identified ${identifiedFeatures.length} features for "${ref.name}"`)

            // Save identified features for THIS specific reference
            const { error: updateError } = await supabase
              .from("dialogflow_references")
              .update({
                identified_features: identifiedFeatures
              })
              .eq("id", ref.id)

            if (updateError) {
              console.warn(`[learn-rules] Failed to save identified features for "${ref.name}":`, updateError.message)
            } else {
              console.log(`[learn-rules] Identified features saved for "${ref.name}"`)
            }
          }
        } catch (parseError) {
          console.warn(`[learn-rules] Failed to parse scenario analysis response for "${ref.name}":`, parseError.message)
          continue
        }
      } catch (scenarioError) {
        console.warn(`[learn-rules] Scenario-based feature identification failed for "${ref.name}":`, scenarioError.message)
        continue
      }
    }

    // === Generate comprehensive scenarios summary for LLM ===
    console.log("[learn-rules] Generating comprehensive scenarios summary...")
    let scenariosSummary = ""

    try {
      // Collect all scenarios from all references
      const allScenarios = referencesToAnalyze
        .map(ref => `${ref.name}:\n${ref.scenario_description || '(시나리오 없음)'}`)
        .filter(s => s.trim())
        .join("\n\n---\n\n")

      if (allScenarios.trim()) {
        // Create prompt to generate comprehensive summary
        const summaryPrompt = `다음은 시스템의 여러 레퍼런스가 가진 사용 시나리오들입니다. 이들을 종합하여 시스템 전체의 맥락을 이해할 수 있는 요약본을 작성해주세요.

## 각 레퍼런스의 시나리오

${allScenarios}

## 작업

위 모든 시나리오를 분석하고, 다음을 포함한 종합 요약본을 작성하세요:

1. **공통 목표**: 모든 시나리오의 공통 목표는 무엇인가?
2. **차이점**: 각 레퍼런스 간의 주요 차이점은?
3. **통합 전략**: 이 모든 시나리오를 지원하는 마스터 JSON 구조의 핵심 전략
4. **중요 고려사항**: LLM이 JSON을 생성할 때 반드시 고려해야 할 사항

JSON 객체 형식으로 반환하세요:
\`\`\`json
{
  "common_goals": "공통 목표 설명",
  "key_differences": ["차이점1", "차이점2"],
  "integration_strategy": "통합 전략",
  "important_considerations": ["고려사항1", "고려사항2"],
  "summary": "전체 시스템의 종합 요약"
}
\`\`\``

        const summaryResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
              model: LLM_MODEL,
              messages: [
                {
                  role: "user",
                  content: summaryPrompt,
                },
              ],
              max_completion_tokens: 3000,
              temperature: 0.3,
            }),
          }
        )

        const summaryData = await summaryResponse.json()
        if (summaryResponse.ok) {
          const summaryResponseText = summaryData.choices?.[0]?.message?.content || ""
          console.log("[learn-rules] Scenarios summary generated, length:", summaryResponseText.length)

          // Parse summary response
          try {
            let summaryJson = summaryResponseText
            const codeBlockMatch = summaryResponseText.match(/```(?:json)?\s*([\s\S]*?)```/)
            if (codeBlockMatch) {
              summaryJson = codeBlockMatch[1].trim()
            }

            const jsonMatch = summaryJson.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              scenariosSummary = JSON.parse(jsonMatch[0])
              console.log("[learn-rules] Scenarios summary parsed successfully")
            }
          } catch (parseError) {
            console.warn("[learn-rules] Failed to parse scenarios summary:", parseError.message)
            // Store as text if JSON parsing fails
            scenariosSummary = summaryResponseText
          }
        } else {
          console.warn("[learn-rules] Failed to generate scenarios summary:", summaryData)
        }
      } else {
        console.log("[learn-rules] No scenarios found to summarize")
      }
    } catch (summaryError) {
      console.warn("[learn-rules] Scenarios summary generation failed:", summaryError.message)
      // Continue without summary - it's non-fatal
    }

    // Save scenarios summary to master reference
    if (scenariosSummary) {
      try {
        const { error: summaryError } = await supabase
          .from("dialogflow_references")
          .update({
            scenarios_summary: scenariosSummary
          })
          .eq("id", master.id)

        if (summaryError) {
          console.warn("[learn-rules] Failed to save scenarios summary:", summaryError.message)
        } else {
          console.log("[learn-rules] Scenarios summary saved to master reference")
        }
      } catch (e) {
        console.warn("[learn-rules] Error saving scenarios summary:", e.message)
      }
    }

    // Build unified prompt (optimized for token efficiency, now with features and scenario info)
    const prompt = buildUnifiedPrompt(master, children, features)
    const estimatedTokens = Math.ceil(prompt.length / 4) // Rough estimate: 1 token ≈ 4 chars
    console.log("[learn-rules] Prompt length:", prompt.length, "chars, ~", estimatedTokens, "tokens")
    console.log("[learn-rules] Schema extracted from", 1 + children.length, "references")
    console.log("[learn-rules] Features included in prompt:", features.length)

    // Send single OpenAI call
    console.log("[learn-rules] Sending request to OpenAI API...")
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_completion_tokens: 8000,
        }),
      }
    )

    console.log("[learn-rules] OpenAI response status:", openaiResponse.status)

    const openaiData = await openaiResponse.json()
    console.log("[learn-rules] OpenAI response:", openaiData)

    if (!openaiResponse.ok) {
      console.error("[learn-rules] OpenAI API error:", openaiData)
      throw new Error(`OpenAI API error: ${maskApiKeys(openaiData.error?.message || 'Unknown error')}`)
    }

    const responseText = openaiData.choices?.[0]?.message?.content || ""
    console.log("[learn-rules] Response text length:", responseText.length)

    let unifiedTemplate = {
      mappings: {},
      rules: {},
      instructions: "Generated from unified analysis of master + references",
    }

    try {
      // Try to extract JSON from response (handle markdown code blocks)
      let jsonStr = responseText
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim()
      }

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        unifiedTemplate = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error("[learn-rules] Failed to parse OpenAI response:", e.message)
      // Mark all as invalid if parsing fails
      const allReferenceIds = [master.id, ...children.map((c) => c.id)]
      await supabase
        .from("dialogflow_references")
        .update({
          unified_template_status: "invalid",
        })
        .in("id", allReferenceIds)
      return new Response(
        JSON.stringify({ error: "Failed to parse Gemini response" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      )
    }

    // Store unified template on ALL references (master + children)
    const allReferenceIds = [master.id, ...children.map((c) => c.id)]

    console.log("[learn-rules] About to update references:", allReferenceIds)
    console.log("[learn-rules] Updating with unified_generation_template:", JSON.stringify(unifiedTemplate).substring(0, 100))

    // Explicitly log that we're clearing old learning data
    console.log("[learn-rules] Clearing old learning data for references:", allReferenceIds)

    const { error: updateError, data: updateData } = await supabase
      .from("dialogflow_references")
      .update({
        unified_generation_template: unifiedTemplate,
        unified_template_status: "completed",
      })
      .in("id", allReferenceIds)
      .select()

    console.log("[learn-rules] Update result - error:", updateError, "data count:", updateData?.length)

    // Log successful update with new template details
    console.log(`[learn-rules] Learning data updated for ${allReferenceIds.length} references`)
    console.log("[learn-rules] New unified template keys:", Object.keys(unifiedTemplate))

    if (updateError) {
      console.error("[learn-rules] Update error:", updateError)
      const errorMsg = `DB Update Failed: ${updateError.message}`
      console.error("[learn-rules] " + errorMsg)

      // Mark as invalid if we failed to update
      await supabase
        .from("dialogflow_references")
        .update({
          unified_template_status: "invalid",
        })
        .in("id", allReferenceIds)

      return new Response(JSON.stringify({
        error: errorMsg,
        debug: {
          updateError: updateError.message,
          attemptedIds: allReferenceIds,
          templateSize: JSON.stringify(unifiedTemplate).length
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    // Verify data was actually updated
    if (!updateData || updateData.length === 0) {
      const msg = "Update returned no data - possible permission issue"
      console.error("[learn-rules] " + msg)
      return new Response(JSON.stringify({
        error: msg,
        debug: {
          updatedCount: updateData?.length || 0,
          attemptedIds: allReferenceIds
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    console.log(
      `[learn-rules] Successfully stored unified template on ${allReferenceIds.length} references`
    )

    // === TIER 1: Extract BasicRules ===
    console.log("[learn-rules] Starting Tier 1: BasicRules extraction")

    let basicRules: any = null
    try {
      basicRules = extractBasicRules(master.json_data)
      console.log("[learn-rules] Basic rules extracted successfully")
    } catch (basicRulesError) {
      console.error("[learn-rules] Failed to extract basic rules:", basicRulesError)
      // Non-fatal - continue even if basic rules extraction fails
      basicRules = null
    }

    // Store BasicRules in reference
    if (basicRules) {
      const { error: updateBasicRulesError } = await supabase
        .from("dialogflow_references")
        .update({
          basic_rules: basicRules,
          basic_rules_version: new Date().toISOString(),
          basic_rules_status: 'completed'
        })
        .eq("id", master.id)

      if (updateBasicRulesError) {
        console.error("[learn-rules] Failed to update basic_rules:", updateBasicRulesError)
      } else {
        console.log("[learn-rules] BasicRules stored successfully")
      }
    }

    // === TIER 2: Load or create field definitions ===
    console.log('[learn-rules] Step 3: Loading Tier 2 field definitions from database...')

    let fieldDefinitionsCount = 0
    let fieldDefinitions: any[] = []

    try {
      // Check if field definitions already exist
      const { data: existingDefinitions, error: checkError } = await supabase
        .from('rule_field_definitions')
        .select('*')
        .eq('reference_id', master.id)

      if (checkError) {
        console.error('[learn-rules] Failed to check existing field definitions:', checkError)
        throw new Error('Failed to load field definitions')
      }

      fieldDefinitions = existingDefinitions || []

      // If no field definitions exist, auto-generate from Master JSON structure
      if (fieldDefinitions.length === 0) {
        console.log('[learn-rules] No field definitions found. Auto-generating from Master JSON...')

        // Generate field definitions from Master JSON structure
        fieldDefinitions = generateFieldDefinitionsFromJson(master.json_data, master.id)

        // Save to database
        if (fieldDefinitions.length > 0) {
          const { error: insertError } = await supabase
            .from('rule_field_definitions')
            .insert(fieldDefinitions)

          if (insertError) {
            console.error('[learn-rules] Failed to save auto-generated field definitions:', insertError)
            throw new Error('Failed to save field definitions')
          }

          console.log(`[learn-rules] Auto-generated and saved ${fieldDefinitions.length} field definitions`)
        }
      } else {
        console.log(`[learn-rules] Found ${fieldDefinitions.length} existing field definitions`)
      }

      fieldDefinitionsCount = fieldDefinitions.length

      // Update reference status
      const { error: updateError } = await supabase
        .from('dialogflow_references')
        .update({
          field_definitions_status: 'completed',
          basic_rules_status: 'completed'
        })
        .eq('id', master.id)

      if (updateError) {
        console.error('[learn-rules] Failed to update reference status:', updateError)
      } else {
        console.log('[learn-rules] Updated reference status to completed')
      }
    } catch (error) {
      console.error('[learn-rules] Error loading/creating field definitions:', error)

      // Update status to error
      try {
        await supabase
          .from('dialogflow_references')
          .update({ field_definitions_status: 'error' })
          .eq('id', master.id)
      } catch (updateErr) {
        console.error('[learn-rules] Failed to update error status:', updateErr)
      }

      // Continue despite error - this is non-fatal
      fieldDefinitionsCount = 0
      fieldDefinitions = []
    }

    return new Response(
      JSON.stringify({
        success: true,
        unified_template: unifiedTemplate,
        references_updated: allReferenceIds.length,
        master_id: masterId,
        children_count: children.length,
        basic_rules_extracted: !!basicRules,
        basic_rules_status: basicRules ? 'completed' : 'skipped',
        field_definitions_count: fieldDefinitionsCount,
        field_definitions: fieldDefinitions,
        features_included: features.length,
        features: features.map(f => ({
          id: f.id,
          name: f.name,
          category: f.category,
          reference_path: f.reference_path
        })),
        scenario_analysis: {
          has_scenario: !!scenario_description,
          identified_features_count: identifiedFeatures.length,
          identified_features: identifiedFeatures.map(f => ({
            name: f.name,
            purpose: f.purpose,
            reference_paths: f.reference_paths
          }))
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    console.error("[learn-rules] Error:", error.message)
    // Try to update unified template status to invalid on critical errors
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const body = await req.json()
      const { reference_id } = body
      if (reference_id) {
        await supabase
          .from("dialogflow_references")
          .update({
            unified_template_status: "invalid",
          })
          .eq("id", reference_id)
      }
    } catch (e) {
      console.error("[learn-rules] Failed to update status on error:", e)
    }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

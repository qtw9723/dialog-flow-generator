import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { callOpenAiChat } from "../_shared/llmCall.ts"
import { LLM_MODEL } from "../_shared/llmModel.ts"
import { buildBundle } from "../../../src/lib/resultBundle/buildBundle.js"
import { designFlow } from "./flow/designFlow.ts"
import { expandFlowWithSpecs } from "./flow/expandWithSpecs.ts"
import { ensureGreeting } from "./flow/validateFlow.ts"
import { fillNodeValues, buildApiReceiveFields } from "./flow/fillValues.ts"
import { deriveEsdSchemas } from "./flow/deriveEsdSchemas.ts"
import { deriveApiDefs, applyApiNames, bindApiParams } from "./flow/deriveApiDefs.ts"
import { deriveNlpData } from "../_shared/deriveNlpData.ts"
import type { NlpBundle } from "../_shared/deriveNlpData.ts"
import { intentNameOf } from "../_shared/intentName.ts"
import { resolveRootScenarioNames } from "./flow/resolveRootScenarios.ts"
import { emptyUsage, accumulateUsage, serializeUsage } from "./flow/usage.ts"
import { groupRulesByStage, renderRuleSection } from "./flow/rules.ts"
import { buildVarFormatMap, wrapValidationLoops, resolveLoopRule } from "./flow/wrapValidationLoops.ts"
import { normalizeLoopExitVars } from "./flow/normalizeLoopExit.ts"
import { stripMeaninglessConditionNodes } from "./flow/stripConditionNodes.ts"
import { initLoopAccumulators } from "./flow/initAccumulators.ts"
import { wrapCollectionLoops, buildRepeatVarSet } from "./flow/wrapCollectionLoops.ts"
import { resolveLoopBehavior } from "./flow/loopBehavior.ts"
import { extractCategory, selectExamples, renderExamples } from "./flow/scenarioExamples.ts"
import { collectLlmUsage, applyLlmBlocks, collectScenarioNames, collectScenarioDetails } from "./flow/applyLlmBlocks.ts"
import { normalizeFallback } from "./flow/normalizeFallback.ts"
import { guardApiResults } from "./flow/apiResultGuard.ts"
import { buildRulesSnapshot, buildScenarioExamplesMeta } from "./flow/observability.ts"
import { collectSeedSelections, applyScenarioSeeds } from "./flow/applyScenarioSeeds.ts"
import { proposeMapping } from "./flow/proposeMapping.ts"
import { extractCollectVarsFromJson } from "./flow/extractCollectVars.ts"
// 주의: applyLlmBlocks.ts도 collectScenarioNames를 export한다(설문 응답 → 전체 시나리오 이름,
// prompt 재료용, 기존). 이건 이름이 같은 별개 함수 — FlowSpec의 scenarioName 태깅을 모은다(신규,
// generation_tiers.scenarios용) — 라서 충돌을 피하려고 별칭으로 들여온다.
import { collectScenarioNames as collectFlowScenarioNames } from "./flow/collectScenarioNames.ts"
import { normalizeElseOrder } from "../../../src/lib/flow/normalizeElseOrder.js"
import { findShadowedBranches } from "../../../src/lib/flow/findShadowedBranches.js"
import { mergeConsecutiveOutputs } from "../../../src/lib/flow/mergeConsecutiveOutputs.js"
import { mapScenarioResponses, promptView, withDerivedLegacy } from "../../../src/lib/scenario/steps.js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

const setNestedValue = (obj: any, path: string, value: any): void => {
  try {
    const keys = path.split(".")
    let current = obj
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
  } catch (err) {
    console.error(`[dialogflow-generator] Failed to set nested value at path "${path}":`, err)
    throw new Error(`Invalid path for value assignment: ${path}`)
  }
}

/**
 * Build JSON structure from mappings
 * Converts question_id -> json_path mappings into a nested object structure
 * Example: { "q1": "user.name", "q2": "user.email" } → { user: { name: "", email: "" } }
 */
const buildJsonStructureFromMappings = (mappings: Record<string, string>): any => {
  const result: any = {}

  for (const jsonPath of Object.values(mappings)) {
    if (!jsonPath) continue

    const keys = jsonPath.split(".")
    let current = result

    // Create nested structure
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }

    // Initialize leaf value as empty string
    const lastKey = keys[keys.length - 1]
    if (!(lastKey in current)) {
      current[lastKey] = ""
    }
  }

  return result
}


function formatScenariosForPrompt(scenarios: any[], fieldNames: string[]): string {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return ""
  }

  return scenarios
    .map((scenario, idx) => {
      const lines = [`시나리오 ${idx + 1}:`]
      fieldNames.forEach(fieldName => {
        if (scenario[fieldName] && String(scenario[fieldName]).trim().length > 0) {
          lines.push(`  ${fieldName}: ${scenario[fieldName]}`)
        }
      })
      return lines.join('\n')
    })
    .join('\n\n')
}

/**
 * Group responses by question role
 * Returns organized data structure with responses categorized by their role
 */
interface ResponsesByRole {
  required_context: Record<string, any>
  optional_context: Record<string, any>
  constraint: Record<string, any>
  intent: Record<string, any>
  preference: Record<string, any>
}

const groupResponsesByRole = (
  responses: Record<string, any>,
  questions: any[]
): ResponsesByRole => {
  const questionsByRole = new Map<string, any[]>()
  const roleGroups: ResponsesByRole = {
    required_context: {},
    optional_context: {},
    constraint: {},
    intent: {},
    preference: {}
  }

  // Group questions by role
  questions.forEach(q => {
    const role = q.question_role || 'required_context'
    if (!questionsByRole.has(role)) {
      questionsByRole.set(role, [])
    }
    questionsByRole.get(role)!.push(q)
  })

  // Map responses to role groups
  for (const [role, roleQuestions] of questionsByRole.entries()) {
    roleQuestions.forEach(q => {
      if (responses[q.id] !== undefined) {
        roleGroups[role as keyof ResponsesByRole][q.text] = responses[q.id]
      }
    })
  }

  return roleGroups
}

interface StructureValidationResult {
  valid: boolean
  errors: string[]
  missing_fields: string[]
}

/**
 * Helper: get value from nested object path
 */
const getNestedValueForValidation = (obj: any, path: string): any => {
  const keys = path.split(/[.\[\]]/).filter(k => k)
  let current = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

/**
 * Validate generated structure matches BasicRules
 */
const validateStructureAgainstBasicRules = (
  generatedStructure: any,
  basicRules: any
): StructureValidationResult => {
  const errors: string[] = []
  const missingFields: string[] = []

  // Check required fields
  for (const field of basicRules.schema.required_fields) {
    if (!(field in generatedStructure)) {
      errors.push(`Missing required field: ${field}`)
      missingFields.push(field)
    }
  }

  // Check type consistency
  for (const [path, fieldType] of Object.entries(basicRules.type_definitions)) {
    const value = getNestedValueForValidation(generatedStructure, path)
    if (value !== null && value !== undefined && value !== "") {
      const actualType = Array.isArray(value) ? 'array' : typeof value
      const expectedType = (fieldType as any).base_type
      if (actualType !== expectedType) {
        errors.push(`Type mismatch at ${path}: expected ${expectedType}, got ${actualType}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missing_fields: missingFields,
  }
}

/**
 * Helper: set value at nested path for structure building
 */
const setNestedValueForStructure = (obj: any, path: string, value: any): void => {
  const keys = path.split(/[.\[\]]/).filter(k => k)
  let current = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current)) {
      current[key] = {}
    }
    current = current[key]
  }

  const lastKey = keys[keys.length - 1]
  current[lastKey] = value
}

/**
 * Generate structure programmatically from BasicRules (fallback when LLM fails)
 */
const generateStructureFromBasicRules = (basicRules: any): any => {
  console.log("[dialogflow-generator] [Tier 2] Fallback: Generating structure from BasicRules...")
  const structure: any = {}

  // Populate required fields with empty/null values
  for (const field of basicRules.schema.required_fields) {
    const fieldType = basicRules.type_definitions[field]
    if (!fieldType) {
      structure[field] = null
      continue
    }

    const baseType = (fieldType as any).base_type
    if (baseType === 'array') {
      structure[field] = []
    } else if (baseType === 'object') {
      structure[field] = {}
    } else {
      structure[field] = null
    }
  }

  // Build nested structures from patterns
  if (basicRules.structural_rules && basicRules.structural_rules.default_structures) {
    for (const [path, defaultStruct] of Object.entries(basicRules.structural_rules.default_structures)) {
      setNestedValueForStructure(structure, path, JSON.parse(JSON.stringify(defaultStruct)))
    }
  }

  console.log("[dialogflow-generator] [Tier 2] Fallback structure created")
  return structure
}

// ============================================================================
// TIER 3: VALUE POPULATION FROM SOLUTION RULES
// ============================================================================

/**
 * Validate function code for security before execution
 */
function isSafeFunctionCode(code: string): boolean {
  const prohibited = [
    'require', 'import', 'eval', 'Function', 'constructor',
    'process', 'global', 'window', 'document',
    'fetch', 'XMLHttpRequest', 'fs', 'path'
  ]

  const lowerCode = code.toLowerCase()
  if (prohibited.some(p => lowerCode.includes(p))) return false

  // Validate it's parseable JavaScript
  try {
    new Function('return (' + code + ')')
    return true
  } catch {
    return false
  }
}

/**
 * Interpolate template with variable substitution
 */
function interpolateTemplate(template: string, context: any): string {
  let result = template

  // Replace ${variable} with context values
  const varPattern = /\$\{([^}]+)\}/g
  result = result.replace(varPattern, (match, varName) => {
    if (varName in context.variables) {
      return String(context.variables[varName])
    }
    if (varName in context.responses) {
      return String(context.responses[varName])
    }
    return match
  })

  return result
}

/**
 * Execute JavaScript function with limited context
 */
function executeFunction(functionCode: string, context: any): any {
  if (!isSafeFunctionCode(functionCode)) {
    throw new Error("Function code contains prohibited patterns")
  }

  try {
    const fn = new Function(
      'responses', 'variables', 'now', 'uuid',
      `"use strict"; return (${functionCode})`
    )

    return fn(
      context.responses,
      context.variables,
      context.now,
      context.uuid
    )
  } catch (err) {
    throw new Error(`Function execution failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Validate value matches expected FieldType
 */
function isValidType(value: any, fieldType: any): boolean {
  if (value === null && !fieldType.is_required) return true

  const actualType = Array.isArray(value) ? 'array' : typeof value
  if (actualType !== fieldType.base_type) return false

  if (fieldType.enum && !fieldType.enum.includes(value)) return false

  if (fieldType.pattern && typeof value === 'string') {
    if (!new RegExp(fieldType.pattern).test(value)) return false
  }

  return true
}

/**
 * Helper: get value from nested path
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split(/[.\[\]]/).filter(k => k)
  let current = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

/**
 * Evaluate conditional expression
 */
function evaluateCondition(value: any, operator: string, expected: string): boolean {
  switch (operator) {
    case 'equals':
      return String(value) === expected
    case 'contains':
      return String(value).includes(expected)
    case 'matches':
      return new RegExp(expected).test(String(value))
    default:
      return false
  }
}

/**
 * Generate UUID helper for rule execution context
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Get value from nested path in object
 */
function getReferenceValue(json: any, path: string): any {
  try {
    const keys = path.split('.')
    let value = json
    for (const key of keys) {
      value = value[key]
      if (value === undefined) return null
    }
    return value
  } catch (error) {
    console.error(`[dialogflow-generator] Reference resolution failed for path "${path}":`, error)
    return null
  }
}

/**
 * Execute conditional rule
 */
function executeConditionalRule(config: any, context: any): any {
  try {
    const { condition, then: thenValue, else: elseValue } = config

    if (!condition) return null

    // Check condition
    let conditionMet = false
    switch (condition.operator) {
      case 'equals':
        conditionMet = context.responses[condition.field] === condition.value
        break
      case 'contains':
        conditionMet = String(context.responses[condition.field]).includes(condition.value)
        break
      case 'matches':
        conditionMet = new RegExp(condition.value).test(String(context.responses[condition.field]))
        break
    }

    return conditionMet ? thenValue : elseValue
  } catch (error) {
    console.error(`[dialogflow-generator] Conditional execution failed:`, error)
    return null
  }
}

/**
 * Generate array from rule configuration
 */
function generateArrayFromRule(config: any, context: any): any[] {
  try {
    const { count, element } = config
    let arrayCount = count

    if (typeof count === 'string') {
      // If count is a reference to a response field
      arrayCount = parseInt(String(context.responses[count])) || 1
    }

    const result = []
    for (let i = 0; i < arrayCount; i++) {
      result.push(element)
    }
    return result
  } catch (error) {
    console.error(`[dialogflow-generator] Array generation failed:`, error)
    return []
  }
}

/**
 * Execute array rule to generate array values
 */
async function executeArrayRule(arrayHandling: any, context: any): Promise<any[]> {
  const result: any[] = []

  // Get element count from context
  let count = 1
  if (arrayHandling.count_source) {
    const countValue = getNestedValue(context.responses, arrayHandling.count_source)
    count = parseInt(String(countValue)) || 1
  }

  // Respect min/max bounds
  if (arrayHandling.min_elements) {
    count = Math.max(count, arrayHandling.min_elements)
  }
  if (arrayHandling.max_elements) {
    count = Math.min(count, arrayHandling.max_elements)
  }

  // Generate elements
  if (arrayHandling.element_rule) {
    for (let i = 0; i < count; i++) {
      const elementContext = {
        ...context,
        variables: {
          ...context.variables,
          array_index: i
        }
      }
      const element = await executeRule(arrayHandling.element_rule, elementContext)
      result.push(element)
    }
  }

  return result
}

/**
 * Execute a Solution Rule and return generated value
 */
async function executeRule(ruleContent: any, context: any): Promise<any> {
  const ruleType = ruleContent.type || 'direct'

  switch (ruleType) {
    case 'direct':
      return ruleContent.value

    case 'template':
      return interpolateTemplate(ruleContent.template || '', context)

    case 'function':
      return executeFunction(ruleContent.function_code || '', context)

    case 'reference':
      return context.variables[ruleContent.source_field] || null

    case 'conditional':
      const condition = ruleContent.condition
      const fieldValue = getNestedValue(context.responses, condition.field)
      const conditionMet = evaluateCondition(
        fieldValue,
        condition.operator,
        condition.value
      )

      if (conditionMet) {
        return await executeRule(condition.then, context)
      } else if (condition.else) {
        return await executeRule(condition.else, context)
      }
      return null

    case 'array':
      return await executeArrayRule(ruleContent.array_handling || {}, context)

    default:
      return null
  }
}

/**
 * Populate JSON structure with values from Solution Rules
 */
async function populateValuesFromRules(
  structure: any,
  responses: Record<string, any>,
  basicRules: any,
  solutionRules: any[]
): Promise<{ json: any; populated_paths: string[]; errors: string[] }> {
  const result = {
    json: JSON.parse(JSON.stringify(structure)),
    populated_paths: [] as string[],
    errors: [] as string[]
  }

  // Build execution context
  const context = {
    responses,
    variables: {} as Record<string, any>,
    now: new Date().toISOString(),
    uuid: () => crypto.randomUUID?.() || 'uuid-' + Math.random()
  }

  // Group rules by json_paths
  const rulesByPath = new Map<string, any[]>()
  for (const rule of solutionRules) {
    if (rule.json_paths && Array.isArray(rule.json_paths)) {
      for (const path of rule.json_paths) {
        if (!rulesByPath.has(path)) {
          rulesByPath.set(path, [])
        }
        rulesByPath.get(path)!.push(rule)
      }
    }
  }

  // Execute rules for each path
  for (const [path, rules] of rulesByPath.entries()) {
    try {
      for (const rule of rules) {
        const value = await executeRule(rule.content, context)

        // Validate type
        const expectedType = basicRules.type_definitions?.[path]
        if (expectedType && !isValidType(value, expectedType)) {
          result.errors.push(`Type mismatch at ${path}`)
          continue
        }

        // Set value
        setNestedValue(result.json, path, value)
        result.populated_paths.push(path)
        context.variables[path] = value
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Error at ${path}: ${errMsg}`)
    }
  }

  return result
}


serve(async (req: Request) => {
  // 생성 소요 시간 측정 시작. 범위 = 이 핸들러 진입 ~ 결과 저장 직전(서버 시간).
  // 클라이언트 왕복·네트워크는 포함하지 않으므로 사용자 체감보다 조금 짧게 나온다.
  const startedAt = Date.now()
  const T = tablePicker(isDevRequest(req.url))  // DEV 슬러그(-dev)면 dev_ 테이블 사용
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { reference_id, responses: rawResponses, esd, confirmed_mapping, source, doc_coverage } = await req.json()
    // 생성 경로 마커(선택). 'survey'|'nl'|'doc'만 인정 — 결과 수정 화면의 설문 편집 게이팅에 쓴다.
    // 값이 없거나 목록 밖이면 키를 넣지 않는다(하위호환 — 기존 결과·미지정 결과는 마커 없음).
    const generationSource: "survey" | "nl" | "doc" | null =
      source === "survey" || source === "nl" || source === "doc" ? source : null

    // Validate required inputs
    if (!reference_id) {
      throw new Error("reference_id is required")
    }
    if (!rawResponses || typeof rawResponses !== "object") {
      throw new Error("responses object is required")
    }
    // 시나리오 흐름(단계)이 있으면 기존 키(수집 정보·외부 연동·분기)를 단계에서 파생해 덮어쓴다 — 결정론 코드
    // (반복·검증 루프, API 파생 등)가 단계와 같은 내용을 보게. 단계가 없는 입력은 원본 그대로(생성 경로 불변).
    // 설계: docs/superpowers/specs/2026-10-20-scenario-steps-flow-design.md
    const responses: Record<string, any> = mapScenarioResponses(rawResponses, withDerivedLegacy)
    // 선택적 ESD 번들(앞단 생성/매핑 산출물). 있으면 generation_tiers.esd에 그대로 보관한다.
    // 없으면 키 자체를 넣지 않아 기존 결과와 바이트-동등(하위호환). 정규화는 결과 편집(EsdEditor)이 담당.
    const esdBundle = esd && typeof esd === "object" && !Array.isArray(esd) ? esd : null
    // 블록 C: 사용자 확정 매핑. 있으면 fillNodeValues에 강제 제약으로 주입, esd_mapping_confirmed에 기록.
    // 없으면(토글 off·esd 미연결) 키 자체 미삽입 — 기존 경로 완전 무변화.
    const confirmedMappingInput: Array<{ esdField: string; varName: string | null }> | null =
      Array.isArray(confirmed_mapping) && confirmed_mapping.length > 0 ? confirmed_mapping : null

    console.log("[dialogflow-generator] reference_id:", reference_id)
    console.log("[dialogflow-generator] responses count:", Object.keys(responses).length)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // 소유자는 클라이언트 입력이 아니라 검증된 JWT에서 결정.
    // 토큰이 있으면 그 사용자가 소유자, 없으면(예: master 관리자) user_id=null·익명.
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    let owner_user_id: string | null = null
    let created_by = ""
    if (bearer && bearer !== supabaseAnonKey) {
      const { data: { user: authUser } } = await supabase.auth.getUser(bearer)
      if (authUser) {
        owner_user_id = authUser.id
        created_by = authUser.email || ""
      }
    }

    // Fetch the specified reference
    const { data: reference, error: refError } = await supabase
      .from("dialogflow_references")
      .select("*")
      .eq("id", reference_id)
      .single()

    if (refError || !reference) {
      console.error("[dialogflow-generator] Reference fetch error:", refError)
      throw new Error("Reference not found. Please provide a valid reference_id.")
    }

    // 생성 전제(레퍼런스가 derive 완료 = nodeSpecs 보유)는 아래 designFlow에서 게이트한다.

    // Load questions with role information
    console.log("[dialogflow-generator] Loading questions with role information")
    const { data: questionsData, error: questionsError } = await supabase
      .from(T("questions"))
      .select("id, text, input_type, question_role, template_id, feature_id")

    if (questionsError) {
      console.error("[dialogflow-generator] Questions fetch error:", questionsError)
      throw questionsError
    }

    const questions = questionsData || []
    console.log(`[dialogflow-generator] Loaded ${questions.length} questions`)

    // Group responses by their role
    console.log("[dialogflow-generator] Grouping responses by question role")
    // LLM 프롬프트(Stage 1·fillValues)에는 단계만 — 같은 내용이 기존 키로 또 들어가 노드가 중복되지 않게.
    const responsesByRole = groupResponsesByRole(mapScenarioResponses(responses, promptView), questions)
    console.log("[dialogflow-generator] Responses grouped:", Object.keys(responsesByRole).map(role => `${role}: ${Object.keys(responsesByRole[role as keyof ResponsesByRole]).length}`).join(', '))

    // "챗봇 이름" 응답 → 생성 봇 이름(결과 식별용). 문항 텍스트로 식별.
    const nameQuestion = questions.find((q: any) => typeof q.text === "string" && q.text.includes("챗봇 이름"))
    const botName = nameQuestion && typeof responses[nameQuestion.id] === "string" && responses[nameQuestion.id].trim()
      ? responses[nameQuestion.id].trim()
      : ""

    // Check if scenarios exist and load templates if needed
    let templatesById: Map<string, any> | null = null
    const hasScenarios = Object.values(responses).some(
      (v: any) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object'
    )

    if (hasScenarios) {
      console.log("[dialogflow-generator] Scenario data detected, loading templates")
      const { data: templatesData, error: templatesError } = await supabase
        .from("templates")
        .select("*")

      if (templatesError) throw templatesError
      templatesById = new Map(templatesData?.map(t => [t.id, t]) || [])
    }

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured in Supabase Edge Functions")
    }

    // === TIER 2: Load field definitions and generate structure ===
    let fieldDefinitions: any[] = []
    let generationTiersMetadata = {
      design_ok: false,
      expand_count: 0,
      field_definitions_loaded: 0,
      rules_executed: [] as any[],
      rules_skipped: [] as any[]
    }

    console.log('[dialogflow-generator] [Tier 2] Loading field definitions from database...')
    const { data: loadedFieldDefinitions, error: fdError } = await supabase
      .from('rule_field_definitions')
      .select('*')
      .eq('reference_id', reference_id)

    if (fdError) {
      console.warn('[dialogflow-generator] [Tier 2] Failed to load field definitions:', fdError)
    } else if (loadedFieldDefinitions && loadedFieldDefinitions.length > 0) {
      fieldDefinitions = loadedFieldDefinitions
      generationTiersMetadata.field_definitions_loaded = fieldDefinitions.length
      console.log(`[dialogflow-generator] [Tier 2] Loaded ${fieldDefinitions.length} field definitions`)
    }

    // ┌─ 생성 파이프라인 스테이지: 이름 ↔ 레거시 번호 (이력 추적용) ────────────
    // │ 로그·주석은 함수명(스테이지 이름) 기준. 과거 커밋/문서/로그의 번호는 아래로 대응.
    // │  ① 설계   designFlow ············ 구 STAGE 1
    // │  ② 전개   expandFlowWithSpecs ··· 구 STAGE 2
    // │           deriveNlpData ········ NLP 학습 데이터(v0.8.0) — v0.8.1에서 조건보다 앞으로
    // │           fillNodeValues ········ 구 STAGE 2.5 (조건 패스가 위 인텐트·엔티티를 참조)
    // │           deriveEsdSchemas ······ 구 STAGE 2.6 (ESD)
    // │           deriveApiDefs ········· 구 STAGE 2.6 (API)
    // │  ③ 안전   normalizeLoopExit ····· 구 STAGE 2.9
    // │           wrapCollectionLoops ··· 구 STAGE 2.95
    // │           wrapValidationLoops ··· 구 STAGE 3
    // │           stripConditionNodes ··· 구 STAGE 3.5
    // │           initLoopAccumulators ·· 구 STAGE 3.6
    // │           normalizeFallback · 구 STAGE 3.65
    // │           applyScenarioSeeds ···· 구 STAGE 3.68
    // │           applyLlmBlocks ········ 구 STAGE 3.7
    // │           guardApiResults ······· 구 STAGE 3.75
    // └──────────────────────────────────────────────────────────────
    // === designFlow: LLM이 추상 플로우 설계 (노드 종류·순서·분기·의도만) ===
    console.log("[dialogflow-generator] === designFlow: Designing abstract flow with LLM ===")
    // 단일 소스: 레퍼런스에서 파생한 노드 스펙(derive-node-specs)만 사용. 파생 안 됐으면 생성 불가(게이트).
    const derivedSpecs: any[] = Array.isArray((reference.basic_rules as any)?.nodeSpecs)
      ? (reference.basic_rules as any).nodeSpecs : []
    if (derivedSpecs.length === 0) {
      return new Response(
        JSON.stringify({
          error: "이 레퍼런스는 아직 노드 스펙이 파생되지 않았습니다. 먼저 derive-node-specs를 실행하세요.",
          code: "DERIVE_REQUIRED",
          requiresDerive: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }
    const specsByType: Record<string, any> = {}
    for (const s of derivedSpecs) if (s?.type) specsByType[s.type] = s
    console.log(`[dialogflow-generator] 노드 카탈로그: 파생 스펙 ${Object.keys(specsByType).length} types`)

    // fallback는 greeting처럼 1회성 보일러플레이트(expandWithSpecs가 항상 루트에 추가),
    // docquery는 llmchat body 전용(생성기가 지식소스 규격대로 자동 구성) —
    // designFlow이 직접 설계하지 못하도록 카탈로그에서 제외한다(fallback 잔존분은 normalizeFallback가 정리).
    const STAGE1_EXCLUDED_TYPES = new Set(["fallback", "docquery"])
    const nodeCatalog = derivedSpecs.filter((s: any) => !STAGE1_EXCLUDED_TYPES.has(s?.type)).map((s: any) => {
      const variantSlot = (s.slots || []).find((sl: any) => sl.kind === "array<variant>" && sl.variants)
      return {
        type: s.type, label: s.summary || s.type, description: s.summary || "",
        promptInstruction: "", isTerminal: !!s.isTerminal,
        ...(variantSlot ? { variantTypes: Object.keys(variantSlot.variants) } : {}),
      }
    })

    // 루프(subflow)는 레퍼런스 파생에 의존하지 않는 코드 내장 노드.
    if (!specsByType["loop"]) {
      specsByType["loop"] = { type: "loop", isTerminal: false, summary: "반복 루프", example: null }
      nodeCatalog.push({
        type: "loop",
        label: "반복 루프(subflow)",
        description: "특정 구간을 조건 충족까지 반복. flag 변수로 탈출 제어.",
        promptInstruction: "",
        isTerminal: false,
      })
    }

    // solution_rules(어드민·학습이 관리하는 DB)에서 규칙을 읽어 단계별로 묶는다.
    // 규칙은 코드에 하드코딩하지 않고 DB가 source of truth — 레퍼런스 학습/어드민 추가가 즉시 반영된다.
    const { data: allRuleRows } = await supabase
      .from(T("solution_rules"))
      .select("category, title, description, content, order_index")
      .order("order_index", { ascending: true })
    const rulesByStage = groupRulesByStage((allRuleRows || []) as any[])
    const ruleSummary = renderRuleSection(rulesByStage.flow)
    const loopBehavior = resolveLoopBehavior((allRuleRows || []) as any[])
    const fillRules = {
      config: rulesByStage.config,
      output: rulesByStage.output,
      condition: rulesByStage.condition,
    }

    // 모든 스테이지의 LLM 토큰 사용량을 단일 어댑터에서 누적한다.
    const tokenUsage = emptyUsage()
    // OpenAI 호출 어댑터 (designFlow·fillNodeValues·derive* 공용)
    // ⚠ 예전엔 자체 fetch였고 resp.ok를 보지 않아 401·429·500에도 빈 문자열로 계속됐다
    //    (오류 응답엔 usage도 없어 사용량까지 낮게 나왔다). 이후 사유와 함께 던지게 했지만
    //    재시도가 없어, 503 한 번에 ESD 타입 추론이 string 폴백으로 떨어졌다(결과 1713d3d0).
    //    이제 공유 모듈이 일시 오류를 재시도하고, 끝내 실패하면 사유와 함께 던진다.
    //    설계 단계(designFlow)는 try/catch 밖이라 요청이 사유와 함께 실패하고,
    //    NLP 파생(deriveNlpData)은 자체 try/catch가 있어 nlp_error에 사유가 남는다.
    const callLlm = (prompt: string): Promise<string> =>
      callOpenAiChat({
        apiKey: openaiApiKey,
        prompt,
        temperature: 0.2,
        onUsage: (usage) => accumulateUsage(tokenUsage, usage),
      })

    // applyScenarioSeeds 재료: 설문에서 "레퍼런스 선택"된 시나리오와 해당 레퍼런스 행을 미리 확보.
    const seedSelections = collectSeedSelections(responses)
    let seedRefRows: any[] = []
    // Rider 2: 조회 실패 원인을 관측성에 남긴다(3.68 seeded가 비거나 skipped일 때 원인 역추적용).
    let seedFetchError = ""
    if (seedSelections.length > 0) {
      try {
        const keys = seedSelections.map((s) => s.refKey)
        const { data: byId } = await supabase
          .from(T("dialogflow_scenario_references")).select("id, name, flow_json").in("id", keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k)))
        const { data: byName } = await supabase
          .from(T("dialogflow_scenario_references")).select("id, name, flow_json").in("name", keys)
        seedRefRows = [...(byId || []), ...(byName || [])]
      } catch (e) {
        seedFetchError = (e as Error).message
        console.warn("[dialogflow-generator] seed refs fetch skipped:", seedFetchError)
      }
    }

    // Mode A: 사용자 산업군의 시나리오 레퍼런스를 few-shot 예시로 주입(있을 때만).
    // 주입 여부·선택 결과를 scenario_examples 메타로 남긴다(관측성 — "조용한 skip" 제거).
    let scenarioExamples = ""
    let scenarioExamplesMeta = buildScenarioExamplesMeta({
      category: "", candidates: 0, pickedNames: [], examplesText: "", skippedReason: "no-category",
    })
    try {
      const category = extractCategory(responsesByRole)
      if (category) {
        const userScenarioNames = Object.values(responses).flatMap((v: any) =>
          Array.isArray(v) ? v.map((it: any) => it?.["시나리오 이름"]).filter(Boolean) : []
        )
        const seededNames = new Set(seedSelections.map((s) => s.scenarioName))
        const fewshotNames = userScenarioNames.filter((n: string) => !seededNames.has(String(n)))
        const { data: scenRefs, error: scenRefsError } = await supabase
          .from(T("dialogflow_scenario_references"))
          .select("id, name, category, flow_json")
          .eq("category", category)
          .order("order_index", { ascending: true })
        // Rider 1: 시드로 쓰일 예정인 레퍼런스 행 자체는 few-shot 후보에서 제외한다.
        // (시나리오 이름은 위에서 이미 스코어링 입력에서 뺐지만, 후보 풀에 남아 있으면
        // selectExamples의 "부족분 순서대로 채움" 폴백으로 그대로 선택될 수 있다.)
        const seedRefKeys = new Set(seedSelections.map((s) => String(s.refKey)))
        const fewshotCandidates = (scenRefs || []).filter((r: any) =>
          !seedRefKeys.has(String(r.id)) && !seedRefKeys.has(String(r.name)))
        const picked = selectExamples(fewshotCandidates, fewshotNames, 3)
        scenarioExamples = renderExamples(picked)
        scenarioExamplesMeta = buildScenarioExamplesMeta({
          category,
          candidates: (scenRefs || []).length,
          pickedNames: picked.map((r: any) => String(r?.name || "")),
          examplesText: scenarioExamples,
          skippedReason: scenRefsError ? `조회 오류: ${scenRefsError.message}` : "",
        })
        console.log(`[dialogflow-generator] [Mode A] category=${category}, examples=${picked.length}`)
      }
    } catch (e) {
      scenarioExamplesMeta = buildScenarioExamplesMeta({
        category: "", candidates: 0, pickedNames: [], examplesText: "",
        skippedReason: (e as Error).message,
      })
      console.warn("[dialogflow-generator] scenario examples skipped:", (e as Error).message)
    }

    const flowResult = await designFlow({ responsesByRole, catalog: nodeCatalog, ruleSummary, callLlm, examples: scenarioExamples, esdBundle: esdBundle ?? undefined })
    // greeting 보장(결정론적 안전장치): LLM이 greeting을 빼먹으면 메인에 인사가 사라지므로 코드에서 주입한다.
    const { flow: generatedFlow, injected: greetingInjected } = ensureGreeting(flowResult.flow)
    generationTiersMetadata.design_ok = true
    console.log(
      `[dialogflow-generator] [designFlow] Flow designed: ${generatedFlow.nodes.length} nodes, ${flowResult.llmCalls} LLM call(s), repaired=${flowResult.repaired}, reprompted=${flowResult.reprompted}, greetingInjected=${greetingInjected}`
    )

    // === expandFlowWithSpecs: 결정론적 노드 전개 (LLM 0콜) — 파생 스펙의 example+슬롯+variant ===
    console.log("[dialogflow-generator] === expandFlowWithSpecs: Expanding flow to structure (deterministic) ===")
    let generatedJson: any = expandFlowWithSpecs(generatedFlow, specsByType, { ...(botName ? { name: botName } : {}), loopBehavior })
    generationTiersMetadata.expand_count = 1

    // === deriveNlpData: 시나리오에서 NLP 학습 데이터(인텐트·엔티티) 파생 ===
    // v0.8.1에서 fillNodeValues **앞으로** 옮겼다 — 조건 패스가 인텐트·엔티티 이름을 참조해야 하는데
    // 뒤에 있으면 조건을 채우는 시점에 이름이 존재하지 않는다. 입력이 사용자 응답(collectScenarioDetails)이라
    // 플로우 생성 결과에 의존하지 않아 옮길 수 있다.
    // ⚠ 대신 파생 ESD 스키마(deriveEsdSchemas 산출물)는 이 시점에 없다 → 선행 확정 ESD(esdBundle)로 대체.
    //    ESD 입력은 "발화에서 값을 뽑을 후보" 힌트일 뿐이라 없어도 파생은 성립한다.
    let nlpBundle: NlpBundle | null = null
    if (generatedJson) {
      try {
        const nlpScenarios = collectScenarioDetails(responses).map((s: any) => ({
          name: s.name, trigger: s.trigger, collects: s.collects, result: s.result, branches: s.branches,
        }))
        const nlp = await deriveNlpData(
          nlpScenarios,
          Array.isArray(esdBundle?.entities) ? esdBundle.entities : [],
          callLlm,
        )
        if (nlp.intents.length > 0 || nlp.entities.length > 0) {
          nlpBundle = nlp
          ;(generationTiersMetadata as any).nlp = nlp
          const uttCount = nlp.intents.reduce((n, it) => n + it.examples.length, 0)
          console.log(`[dialogflow-generator] [deriveNlpData] intents ${nlp.intents.length}, utterances ${uttCount}, entities ${nlp.entities.length}`)
        } else {
          console.log("[dialogflow-generator] [deriveNlpData] 산출물 없음(시나리오 근거 부족)")
        }
      } catch (e) {
        // 파생 실패가 봇 생성을 막지 않는다 — 사유만 남기고 조건은 번들 없이 채운다.
        const msg = e instanceof Error ? e.message : String(e)
        ;(generationTiersMetadata as any).nlp_error = msg
        console.warn("[dialogflow-generator] [deriveNlpData] NLP derivation failed:", msg)
      }
    }

    // 루트 노드 id → 시나리오명. LLM 태그(scenarioName) 1순위, 없으면 라벨 매칭 → 순서 짝짓기.
    // 실측에서 태그가 한 건도 안 붙는 경우가 나왔다(2026-08-28 은행 봇) — 태그만 믿으면
    // 조건이 어느 인텐트를 쓸지 모르고 결과 화면 시나리오 헤더도 빈다.
    let resolvedRootNames: Record<string, string> = {}
    if (generatedJson) {
      const mainDialog = (generatedJson.dialogs || []).find((d: any) => d?.id === "main")
      const nodes: any[] = mainDialog?.nodes || []
      const byId = new Map<string, any>(nodes.map((n) => [n.id, n]))
      const rootIds = ((mainDialog?.then || []) as string[])
        .filter((id) => {
          const n = byId.get(id)
          return n && n.type !== "greeting" && n.type !== "fallback"
        })
      const labelById: Record<string, string> = {}
      for (const id of rootIds) labelById[id] = String(byId.get(id)?.label || "")
      const { scenarios: tagged } = collectFlowScenarioNames(generatedFlow, generatedJson, [])
      const resolved = resolveRootScenarioNames({
        rootIds,
        labelById,
        tagged,
        inputs: collectScenarioDetails(responses).map((s: any) => ({ name: s.name, trigger: s.trigger })),
      })
      resolvedRootNames = resolved.names
      ;(generationTiersMetadata as any).scenario_name_resolution = resolved.counts
      console.log(`[dialogflow-generator] [resolveRootScenarioNames] ${JSON.stringify(resolved.counts)}`)
    }

    // 조건 프롬프트가 이름을 "고르는" 대신 "복사"할 수 있게 루트별 인텐트명을 넘긴다(이름 불일치 = 진입 실패).
    // ⚠ 번들이 없으면(파생 실패) 비워 둔다 — 학습 데이터 없는 봇에 intent() 조건을 넣으면
    //    어떤 시나리오에도 진입하지 못한다. 그때는 조건 프롬프트가 발화 매칭으로 폴백한다.
    const intentByRootId: Record<string, string> = {}
    if (nlpBundle) {
      const known = new Set(nlpBundle.intents.map((i) => i.name))
      for (const [rootId, scenName] of Object.entries(resolvedRootNames)) {
        const intent = intentNameOf(scenName)
        // 번들에 없는 이름은 넘기지 않는다 — 존재하지 않는 인텐트를 복사시키면 그 시나리오는 죽는다.
        if (intent && known.has(intent)) intentByRootId[rootId] = intent
      }
    }

    // === fillNodeValues: 값 채우기 (LLM이 사용자 입력 해석 → 노드 필드 값 생성) ===
    if (generatedJson) {
      console.log("[dialogflow-generator] === fillNodeValues: Filling node values with LLM ===")
      const apiReceiveFields = buildApiReceiveFields(responses)
      const fillResult = await fillNodeValues(generatedJson, responsesByRole, callLlm, fillRules, apiReceiveFields, esdBundle ?? undefined, confirmedMappingInput ?? undefined, nlpBundle, intentByRootId)
      ;(generationTiersMetadata as any).values_filled = fillResult.filled
      if (fillResult.esdResultFields) (generationTiersMetadata as any).esd_result_fields = fillResult.esdResultFields
      if (fillResult.esdRefUnknownKeys) (generationTiersMetadata as any).esd_ref_unknown_keys = fillResult.esdRefUnknownKeys
      if (fillResult.esdResultUnused) (generationTiersMetadata as any).esd_result_unused = fillResult.esdResultUnused
      console.log(`[dialogflow-generator] [fillNodeValues] Filled ${fillResult.filled}/${fillResult.attempted} nodes`)

      // === deriveEsdSchemas: ESD 노드에서 ESD 스키마 파생 (결과와 함께 전달) ===
      // 안쪽 catch들이 조용히 퇴화시키던 사유를 모아 번들에 남긴다(v0.11.0 항목 3).
      const esdWarnings: string[] = []
      try {
        const esdSchemas = await deriveEsdSchemas(generatedJson, callLlm, new Date().toISOString(), esdWarnings, fillResult.esdResultFields)
        ;(generationTiersMetadata as any).esd_schemas = esdSchemas
        console.log(`[dialogflow-generator] [deriveEsdSchemas] Derived ${esdSchemas.length} ESD schema(s)`)
      } catch (e) {
        esdWarnings.push(e instanceof Error ? e.message : String(e))
        console.warn("[dialogflow-generator] [deriveEsdSchemas] ESD schema derivation failed:", e instanceof Error ? e.message : String(e))
      }
      if (esdWarnings.length > 0) (generationTiersMetadata as any).esd_error = esdWarnings.join("\n")

      // === deriveApiDefs: API 연동에서 import용 API 정의 파생 (라이브러리 선택 + 직접입력 초안) ===
      // 안쪽 catch들이 조용히 퇴화시키던 사유를 모아 번들에 남긴다(v0.11.0 항목 3).
      const apiWarnings: string[] = []
      try {
        const { data: apiRefRows } = await supabase.from("dialogflow_api_references").select("name, api_def")
        const apiDefs = await deriveApiDefs(responses, apiRefRows || [], callLlm, apiWarnings)
        if (apiDefs.length > 0) {
          ;(generationTiersMetadata as any).api_defs = apiDefs
          const named = applyApiNames(generatedJson, apiDefs)
          const bound = await bindApiParams(generatedJson, apiDefs, responses, callLlm, apiWarnings)
          console.log(`[dialogflow-generator] [deriveApiDefs] Derived ${apiDefs.length} API def(s), apiName ${named}, params bound ${bound}`)
        }
      } catch (e) {
        apiWarnings.push(e instanceof Error ? e.message : String(e))
        console.warn("[dialogflow-generator] [deriveApiDefs] API def derivation failed:", e instanceof Error ? e.message : String(e))
      }
      if (apiWarnings.length > 0) (generationTiersMetadata as any).api_error = apiWarnings.join("\n")

    }

    // === TIER 3: Load and execute value generator rules ===
    if (generatedJson) {
      console.log("[dialogflow-generator] [Tier 3] Loading value generator rules...")

      const { data: valueGenerators, error: vgError } = await supabase
        .from("rule_value_generators")
        .select("*")
        .eq("reference_id", reference_id)
        .eq("enabled", true)
        .order("order_index", { ascending: true })

      if (vgError) {
        console.warn("[dialogflow-generator] [Tier 3] Failed to load value generators:", vgError)
      } else if (valueGenerators && valueGenerators.length > 0) {
        console.log(`[dialogflow-generator] [Tier 3] Loaded ${valueGenerators.length} value generator rules`)

        // Execute each rule in order
        for (const rule of valueGenerators) {
          try {
            console.log(`[dialogflow-generator] [Tier 3] Executing rule: ${rule.json_path} (type: ${rule.rule_type})`)

            let value: any = null
            const ruleConfig = rule.rule_config || {}

            switch (rule.rule_type) {
              case 'direct':
                // Direct value from rule_config
                value = ruleConfig.value
                break

              case 'template':
                // Template string interpolation: ${variable_name}
                value = interpolateTemplate(ruleConfig.template || '', { responses, variables: {} })
                break

              case 'function':
                // Execute JavaScript function with safety checks
                if (!isSafeFunctionCode(ruleConfig.function_code || '')) {
                  throw new Error('Function code contains unsafe operations')
                }
                const fn = new Function(
                  'responses', 'variables', 'now', 'uuid',
                  `"use strict"; return (${ruleConfig.function_code})`
                )
                value = fn(responses, {}, new Date().toISOString(), generateUUID)
                break

              case 'conditional':
                // Conditional logic execution
                value = executeConditionalRule(ruleConfig, { responses })
                break

              case 'array':
                // Array generation
                value = generateArrayFromRule(ruleConfig, { responses })
                break

              case 'reference':
                // Reference another field from generated JSON
                value = getReferenceValue(generatedJson, ruleConfig.source_field || '')
                break

              default:
                console.warn(`[dialogflow-generator] [Tier 3] Unknown rule type: ${rule.rule_type}`)
                continue
            }

            // Set the value in the generated JSON
            setNestedValue(generatedJson, rule.json_path, value)

            generationTiersMetadata.rules_executed.push({
              id: rule.id,
              json_path: rule.json_path,
              rule_type: rule.rule_type,
              success: true
            })
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            console.error(`[dialogflow-generator] [Tier 3] Failed to execute rule ${rule.json_path}:`, errMsg)
            generationTiersMetadata.rules_skipped.push({
              id: rule.id,
              json_path: rule.json_path,
              rule_type: rule.rule_type,
              error: errMsg
            })
          }
        }

        console.log(
          `[dialogflow-generator] [Tier 3] Complete: Executed ${generationTiersMetadata.rules_executed.length} rules, skipped ${generationTiersMetadata.rules_skipped.length}`
        )
      }
    }

    // === TIER 3: Fallback - Populate values from Solution Rules (legacy) ===
    if (generatedJson && reference.basic_rules && generationTiersMetadata.rules_executed.length === 0) {
      console.log("[dialogflow-generator] [Tier 3] No new value generators found, falling back to Solution Rules")

      try {
        // Load Solution Rules
        const { data: solutionRules } = await supabase
          .from(T("solution_rules"))
          .select("*")
          .order("order_index", { ascending: true })

        const tier3Result = await populateValuesFromRules(
          generatedJson,
          responses,
          reference.basic_rules,
          solutionRules || []
        )

        generatedJson = tier3Result.json

        if (tier3Result.errors.length > 0) {
          console.warn("[dialogflow-generator] [Tier 3] Legacy population had some errors:", tier3Result.errors)
        }

        console.log(
          "[dialogflow-generator] [Tier 3] Legacy population complete: Populated",
          tier3Result.populated_paths.length,
          "paths"
        )
      } catch (tier3Error) {
        console.warn("[dialogflow-generator] [Tier 3] Legacy population failed:", tier3Error instanceof Error ? tier3Error.message : String(tier3Error))
        // Use structure as-is if population fails
      }
    }

    // === normalizeLoopExit: 루프 탈출 변수 정합화 (결정론적) ===
    // LLM이 본문 flag set의 key를 루프 exitVar와 다르게 채우면 런타임에 루프가 안 빠진다.
    // materialized 노드 위에서 본문 boolean flag set의 key를 exitVar로 맞춘다(wrapValidationLoops 이전).
    if (generatedJson) {
      try {
        const { normalized } = normalizeLoopExitVars(generatedJson)
        ;(generationTiersMetadata as any).loop_exit_normalized = normalized
        if (normalized > 0) console.log(`[dialogflow-generator] [normalizeLoopExit] Normalized ${normalized} loop exit var(s)`)
      } catch (e) {
        console.warn("[dialogflow-generator] [normalizeLoopExit] Loop exit normalization failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === wrapCollectionLoops: 반복 수집 루프 래핑 (결정론적) ===
    // '여러 개 입력=예' 수집 항목(LLM은 output→set만 설계)을 누적+종료분기 수집 루프로 감싼다.
    // 검증 래핑(wrapValidationLoops)보다 먼저 — 같은 항목이면 멱등 체크로 중복 래핑 방지.
    if (generatedJson) {
      try {
        const repeatVars = buildRepeatVarSet(responses)
        const { wrapped } = wrapCollectionLoops(generatedJson, repeatVars, loopBehavior)
        ;(generationTiersMetadata as any).collection_loops = wrapped
        if (wrapped > 0) console.log(`[dialogflow-generator] [wrapCollectionLoops] Wrapped ${wrapped} collection loop(s)`)
      } catch (e) {
        console.warn("[dialogflow-generator] [wrapCollectionLoops] Collection loop wrapping failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === wrapValidationLoops: 검증 재시도 루프 래핑 (결정론적) ===
    // 검증 가능한 입력형식(숫자·날짜 등) 수집 항목을 subflow 루프로 감싸 "유효할 때까지 되묻기"를 만든다.
    // 모든 값/멘트 fill이 끝난 materialized 노드 위에서 구조만 재배선. Loop Rule(solution_rules)이 source of truth.
    if (generatedJson) {
      try {
        const loopRule = resolveLoopRule((allRuleRows || []) as any[])
        const varFormatMap = buildVarFormatMap(responses, loopRule)
        const { wrapped } = wrapValidationLoops(generatedJson, varFormatMap, loopRule, loopBehavior)
        ;(generationTiersMetadata as any).validation_loops = wrapped
        console.log(`[dialogflow-generator] [wrapValidationLoops] Wrapped ${wrapped} validation loop(s)`)
      } catch (e) {
        console.warn("[dialogflow-generator] [wrapValidationLoops] Validation loop wrapping failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === stripConditionNodes: 무의미한 컨디션 노드 제거 (결정론적 안전장치) ===
    // 컨디션 노드는 진입 트리거(루트)·분기(자식 ≥2)일 때만 의미가 있다. 규칙(solution_rules)이 1차로 막지만
    // best-effort라, 비루트+자식≤1+빈 condition인 잉여 node를 결과 저장 전 splice한다(생성-후-삭제 아님 → 누수 없음).
    if (generatedJson) {
      try {
        const { removed } = stripMeaninglessConditionNodes(generatedJson)
        ;(generationTiersMetadata as any).stripped_condition_nodes = removed
        if (removed > 0) console.log(`[dialogflow-generator] [stripConditionNodes] Stripped ${removed} meaningless condition node(s)`)
      } catch (e) {
        console.warn("[dialogflow-generator] [stripConditionNodes] Condition node strip failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === initLoopAccumulators: 루프 누적 배열 변수 자동 초기화 (결정론적 안전장치) ===
    // 본문에서 X.concat(...)으로 누적하는 변수 X를 루프 진입 전 init에서 X=[]로 초기화(없으면 첫 반복에 undefined.concat()).
    if (generatedJson) {
      try {
        const { initialized } = initLoopAccumulators(generatedJson)
        ;(generationTiersMetadata as any).initialized_accumulators = initialized
        if (initialized > 0) console.log(`[dialogflow-generator] [initLoopAccumulators] Initialized ${initialized} loop accumulator array(s)`)
      } catch (e) {
        console.warn("[dialogflow-generator] [initLoopAccumulators] Accumulator init failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === normalizeFallback: fallback 1회성 정규화 (결정론적 안전장치) ===
    // fallback는 다이얼로그당 1개(루트 보일러플레이트)만 유효 — designFlow이 플로우 중간에
    // 설계한 잔존분을 정리한다(자식 있으면 컨디션 노드로 전환, 없으면 제거).
    if (generatedJson) {
      try {
        const aeResult = normalizeFallback(generatedJson)
        ;(generationTiersMetadata as any).fallback_injected = aeResult
        if (aeResult.converted + aeResult.removed > 0) {
          console.log(`[dialogflow-generator] [normalizeFallback] Fallback normalized — converted ${aeResult.converted}, removed ${aeResult.removed}`)
        }
      } catch (e) {
        console.warn("[dialogflow-generator] [normalizeFallback] Fallback normalize failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === applyScenarioSeeds: 시나리오 레퍼런스 구조 시드 (결정론) ===
    let seedResult: { seeded: any[] } = { seeded: [] }
    if (generatedJson && seedSelections.length > 0) {
      try {
        console.log("[dialogflow-generator] === applyScenarioSeeds: Applying scenario reference seeds ===")
        seedResult = applyScenarioSeeds(generatedJson, seedSelections, seedRefRows as any[])
        ;(generationTiersMetadata as any).stage368_scenario_seeds = seedResult.seeded
        console.log(`[dialogflow-generator] [applyScenarioSeeds] seeded=${seedResult.seeded.filter((s: any) => !s.skipped).length}/${seedResult.seeded.length}`)
      } catch (e) {
        console.warn("[dialogflow-generator] scenario seeds skipped:", (e as Error).message)
        seedResult = { seeded: [{ scenario: "", ref: "", ref_id: "", mismatch: "", node_type_sequence: [], skipped: (e as Error).message }] }
      }
    }

    // === applyLlmBlocks: AI 자유응답(LLM) 블록 적용 (결정론적) ===
    // 질문지 선택(메뉴형/폴백형)에 따라 llmchat 블록을 보장하고,
    // 모든 llmchat의 apiKey를 비운다(레퍼런스 실키 유출 차단 — 선택과 무관하게 항상 실행).
    if (generatedJson) {
      try {
        const llmUsage = collectLlmUsage(responses, questions as any[])
        const llmCtx = {
          botName,
          topic: llmUsage.topic,
          intent: Object.values(responsesByRole.intent || {}).map(String).join(" ").trim(),
          industry: String(responsesByRole.required_context?.["산업군을 선택해 주세요."] || ""),
          tone: String(responsesByRole.preference?.["봇의 말투를 골라주세요"] || ""),
          features: collectScenarioNames(responses),
          scenarios: collectScenarioDetails(responses),   // 제작한 챗봇 정보를 prompt에 주입
          // Fix I1: applyScenarioSeeds이 레퍼런스 구조로 이미 시드한(성공한) 시나리오 이름 —
          // 수집형 LLM 체인 교체가 이 시나리오의 서브트리를 갈아엎지 않도록 applyLlmBlocks에 전달.
          seededScenarioNames: new Set(
            seedResult.seeded.filter((s: any) => !s.skipped).map((s: any) => s.scenario)
          ),
        }
        const llmResult = applyLlmBlocks(generatedJson, llmUsage, llmCtx)
        ;(generationTiersMetadata as any).llm_blocks = llmResult
        if (llmResult.injected + llmResult.swapped + llmResult.scenario + llmResult.chained + llmResult.normalized > 0) {
          console.log(`[dialogflow-generator] [applyLlmBlocks] LLM blocks — injected ${llmResult.injected}, swapped ${llmResult.swapped}, scenario ${llmResult.scenario}, chained ${llmResult.chained}, normalized ${llmResult.normalized}`)
        }
      } catch (e) {
        console.warn("[dialogflow-generator] [applyLlmBlocks] LLM block apply failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === guardApiResults: api 결과 예외 처리 보장 (결정론적 안전장치) ===
    // API 결과는 안 나올 수 있다 — 레퍼런스 관용구(성공 자식 조건 + catch-all 실패 output)를 항상 보장.
    if (generatedJson) {
      try {
        const guardResult = guardApiResults(generatedJson)
        ;(generationTiersMetadata as any).api_guard = guardResult
        if (guardResult.guarded > 0) {
          console.log(`[dialogflow-generator] [guardApiResults] API result guards added: ${guardResult.guarded}`)
        }
      } catch (e) {
        console.warn("[dialogflow-generator] [guardApiResults] API guard failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === normalizeElseOrder: 조건 없는 갈래(else) 결정론 정렬 (결정론적 안전장치) ===
    // 런타임은 분기의 then을 순서대로 확인한다 — else가 앞에 있으면 뒤의 조건 갈래는 죽은 분기가 된다.
    // applyScenarioSeeds(서브트리 통째 교체)·applyLlmBlocks(구조 변형) 다음, tiers 조립 전에 마지막으로 건다
    // (그보다 앞에 두면 이후 단계가 else-first를 다시 만들어낸다). 편집기(DiagramEditPanel)와 같은 모듈 공유.
    let elseMoved: Array<{ nodeId: string; label: string }> = []
    if (generatedJson) {
      try {
        const { flow: orderedFlow, moved } = normalizeElseOrder(generatedJson)
        generatedJson = orderedFlow
        elseMoved = moved
        if (moved.length > 0) {
          console.log(`[dialogflow-generator] [normalizeElseOrder] Reordered ${moved.length} else branch(es)`)
        }
      } catch (e) {
        console.warn("[dialogflow-generator] [normalizeElseOrder] Else order normalize failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === mergeConsecutiveOutputs: 이어지는 멘트 합치기 (결정론적 안전장치, 2026-10-26 솔루션 확인) ===
    // output이 나가면 턴이 끝나 바로 아래의 조건 없는 output은 사용자가 한 번 더 말해야 나온다.
    // 구조를 바꾸는 단계(시드·LLM 블록·else 정렬) 뒤에 건다 — 앞에 두면 이후 단계가 연속 멘트를 다시 만들 수 있다.
    let outputsMerged: Array<{ nodeId: string; mergedId: string }> = []
    if (generatedJson) {
      try {
        const { flow: joinedFlow, merged } = mergeConsecutiveOutputs(generatedJson)
        generatedJson = joinedFlow
        outputsMerged = merged
        if (merged.length > 0) {
          console.log(`[dialogflow-generator] [mergeConsecutiveOutputs] Merged ${merged.length} consecutive output(s)`)
        }
      } catch (e) {
        console.warn("[dialogflow-generator] [mergeConsecutiveOutputs] failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === findShadowedBranches: 가려진 갈래 검출 (관측성, v0.16.0) ===
    // else 정렬 뒤에도 남는 죽은 갈래(else 2개+·조건 `true`·중복 조건). 어느 갈래가 의도인지 몰라 고치지 않고 기록만 한다.
    let shadowedBranches: ReturnType<typeof findShadowedBranches> = []
    if (generatedJson) {
      try {
        shadowedBranches = findShadowedBranches(generatedJson)
        if (shadowedBranches.length > 0) {
          console.warn(`[dialogflow-generator] [findShadowedBranches] ${shadowedBranches.length} shadowed branch group(s)`)
        }
      } catch (e) {
        console.warn("[dialogflow-generator] [findShadowedBranches] failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // === esd_mapping: ESD 필드 ↔ 수집변수 매핑 결과 기록 (관측성, D4) ===
    // esd_schemas·esd 키와 공존. esdBundle 없으면 키 자체를 넣지 않는다(기존 경로 무변화).
    if (esdBundle && generatedJson) {
      try {
        const collectVars = extractCollectVarsFromJson(generatedJson, esdBundle)
        const esdMapping = proposeMapping(esdBundle, collectVars)
        ;(generationTiersMetadata as any).esd_mapping = esdMapping
        console.log(
          `[dialogflow-generator] [esd_mapping] fields=${esdMapping.mappings.length}, unmapped_esd=${esdMapping.unmappedEsdFields.length}, unmapped_vars=${esdMapping.unmappedVars.length}`,
        )
      } catch (e) {
        console.warn("[dialogflow-generator] [esd_mapping] Mapping computation failed:", e instanceof Error ? e.message : String(e))
      }
    }

    // 블록 C: 확정 매핑이 있으면 별도 키로 기록(auto/confirmed 구분, D8).
    if (confirmedMappingInput) {
      ;(generationTiersMetadata as any).esd_mapping_confirmed = confirmedMappingInput
      console.log(`[dialogflow-generator] [esd_mapping_confirmed] confirmed entries=${confirmedMappingInput.length}`)
    }

    console.log("[dialogflow-generator] JSON generation complete, storing result")
    console.log("[dialogflow-generator] Generated JSON keys:", Object.keys(generatedJson).join(", "))
    console.log(
      "[dialogflow-generator] Generation tiers metadata:",
      JSON.stringify(generationTiersMetadata, null, 2)
    )

    // Add feature mapping + designFlow flow info to generation tiers metadata.
    // NOTE: FlowSpec(추상 플로우)은 전용 컬럼(generated_flow) 대신 generation_tiers.flow에 저장한다.
    // dialogflow_results에 generated_flow 컬럼이 없고, 공유 프로덕션 DB라 DDL은 별도 승인 필요(미적용).
    // 관측성: 규칙 세트 지문(Instruction Bleed 역추적). 실패해도 생성엔 영향 없음.
    let rulesSnapshot: unknown
    try {
      rulesSnapshot = await buildRulesSnapshot(
        (allRuleRows || []) as any[], rulesByStage, scenarioExamples, LLM_MODEL,
      )
    } catch (e) {
      rulesSnapshot = { error: (e as Error).message }
    }

    // 시나리오명 번들(D9): FlowSpec에 LLM이 태깅한 scenarioName을 머신 flow의 시나리오 루트(main.then) id에
    // 묶는다. generated_json에는 절대 싣지 않고 generation_tiers.scenarios로만 흘린다(솔루션 임포터가
    // 미지 필드를 거부). 입력 이름은 collectScenarioNames(responses) — 설문의 "모든" 시나리오 이름
    // (레퍼런스 선택 여부와 무관, collectScenarioDetails 기반) — 에서 가져온다. seedSelections는
    // "레퍼런스 선택"을 지정한 시나리오만 반환하므로 이걸 쓰면 나머지 시나리오가 항상 오탐 mismatch로
    // 잡힌다(정상 verbatim 태깅도 "입력에 없음"으로 기록됨) — 그래서 여기선 쓰지 않는다.
    // 비어 있으면 mismatch 검사를 건너뛴다(생성 무해성).
    const inputScenarioNames = collectScenarioNames(responses)
    const { scenarios: taggedScenarioNames, mismatch: scenarioNameMismatch } =
      collectFlowScenarioNames(generatedFlow, generatedJson, inputScenarioNames)
    // 태그가 비어도 보강 결과로 헤더를 채운다(태그가 있으면 태그가 이긴다 — resolvedRootNames의 1순위).
    const scenarioNames = { ...resolvedRootNames, ...taggedScenarioNames }

    const bundleValues = {
      ...generationTiersMetadata,
      design_stats: {
        node_count: generatedFlow.nodes.length,
        llm_calls: flowResult.llmCalls,
        repaired: flowResult.repaired,
        reprompted: flowResult.reprompted,
      },
      // 전 스테이지 LLM 토큰 사용량 + gpt-4o 단가 기반 예상 비용(컬럼 추가 없이 jsonb에 저장)
      usage: serializeUsage(tokenUsage, LLM_MODEL, Date.now() - startedAt),
      // 생성한 테스터(로그인 이메일) — 누가 만들었는지 구분(컬럼 추가 없이 jsonb에 저장)
      created_by: typeof created_by === "string" ? created_by : "",
      // 관측성 스냅샷(컬럼 추가 없이 jsonb에 저장): few-shot 주입 기록 + 규칙 세트 지문
      // Rider 2: seeded_fetch_error — 시드 레퍼런스 조회(dialogflow_scenario_references) 실패 원인.
      // seeded가 비거나 skipped일 때 이 필드로 원인을 역추적한다(""=정상 조회 또는 시드 미시도).
      scenario_examples: { ...scenarioExamplesMeta, seeded: seedResult.seeded, seeded_fetch_error: seedFetchError },
      rules_snapshot: rulesSnapshot,
      flow: generatedFlow,
      // 시나리오명 번들(D9): 루트 노드 id → LLM이 FlowSpec에 태깅한 시나리오 이름.
      scenarios: scenarioNames,
      // 입력 시나리오 이름과 어긋난 태깅 기록(교정 아님 — 관측성만, 생성 무해성 우선).
      scenario_name_mismatch: scenarioNameMismatch,
      // normalizeElseOrder가 정렬한 분기 노드 id 목록(관측성 — 몇 개나 교정됐는지 추적).
      else_order_moved: elseMoved.map((m) => m.nodeId),
      // 가려진 갈래(관측성). 없으면 키 미삽입 — 쓰기 쪽은 기본값을 저장하지 않는다(계약).
      ...(shadowedBranches.length ? { shadowed_branches: shadowedBranches } : {}),
      // 합친 연속 멘트(관측성). 없으면 키 미삽입.
      ...(outputsMerged.length ? { consecutive_outputs_merged: outputsMerged } : {}),
      // 생성 경로 마커(선택). 없으면 키 미삽입(하위호환). 결과 수정 화면이 설문 편집 노출 판단에 쓴다.
      ...(generationSource ? { source: generationSource } : {}),
      // 문서 추출 커버리지(선택). 없으면 키 미삽입(하위호환) — 어느 열이 무엇이 됐고 무엇이 버려졌는지.
      ...(doc_coverage ? { doc_coverage } : {}),
      // ESD 번들(선택). 없으면 키를 넣지 않아 하위호환. 결과 조회/편집(EsdEditor) + PATCH가 이 자리를 읽고 갱신.
      ...(esdBundle ? { esd: esdBundle } : {}),
    }

    // 계약 조립(v0.10.0). 계약 위반이 생성을 죽이지 않도록 감싼다(런타임 무해 원칙) —
    // 대신 bundle_error에 사유를 남겨 조회로 찾을 수 있게 한다. 위반은 코드가 정한 키에서만
    // 나므로 개발 시점에 테스트가 먼저 잡는다(src/lib/resultBundle/buildBundle.test.js).
    let finalGenerationTiersMetadata: Record<string, unknown>
    try {
      finalGenerationTiersMetadata = (buildBundle as any)("generated", bundleValues)
    } catch (e) {
      console.error("[dialogflow-generator] bundle 계약 위반:", (e as Error).message)
      finalGenerationTiersMetadata = { ...bundleValues, bundle_error: (e as Error).message }
    }

    console.log(
      "[dialogflow-generator] Final generation metadata:",
      JSON.stringify(finalGenerationTiersMetadata, null, 2)
    )

    // Store the generated result with generation_tiers metadata
    const { data, error } = await supabase
      .from(T("dialogflow_results"))
      .insert([
        {
          reference_id,
          generated_json: generatedJson,
          responses: responses,
          generation_tiers: finalGenerationTiersMetadata,
          user_id: owner_user_id,
        },
      ])
      .select()

    if (error) {
      console.error("[dialogflow-generator] Storage error:", error)
      throw error
    }

    if (!data || data.length === 0) {
      console.error("[dialogflow-generator] No data returned from insert")
      throw new Error("Failed to store result - no data returned from database")
    }

    console.log("[dialogflow-generator] Result stored successfully, ID:", data[0].id)

    return new Response(JSON.stringify(data[0]), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 201,
    })
  } catch (error) {
    // PostgrestError 등 plain 객체도 메시지가 드러나도록 (String(obj)="[object Object]" 방지)
    const errorMessage = error instanceof Error
      ? error.message
      : (error && typeof error === "object"
          ? ((error as any).message || (error as any).hint || JSON.stringify(error))
          : String(error))
    console.error("[dialogflow-generator] Error:", errorMessage)

    // Detect specific error types
    const isValidationError = errorMessage?.includes("reference_id is required") ||
      errorMessage?.includes("responses object is required") ||
      errorMessage?.includes("Reference not found")

    const isLearningError = errorMessage?.includes("not ready") ||
      errorMessage?.includes("unified learning")

    return new Response(
      JSON.stringify({
        error: errorMessage,
        ...(isValidationError && { code: "INVALID_REQUEST" }),
        ...(isLearningError && { code: "TRAINING_REQUIRED", requiresTraining: true }),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: isValidationError ? 400 : (isLearningError ? 400 : 500),
      }
    )
  }
})

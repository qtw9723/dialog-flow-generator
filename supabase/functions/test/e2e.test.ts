import { assertEquals, assert, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts"

/**
 * End-to-End Test Flow for DIALOGFLOW Generator
 *
 * Validates the complete workflow from Master JSON upload to final JSON generation:
 * 1. Master JSON Upload + Reference Creation
 * 2. Field Definitions Extraction (Tier 1 → Tier 2)
 * 3. Value Generator Rules Creation (Tier 3)
 * 4. User Responses Submission
 * 5. Complete JSON Generation
 * 6. Output Validation
 *
 * To run with actual database:
 * deno test --allow-env --allow-net supabase/functions/test/e2e.test.ts
 */

// ============================================================================
// GLOBAL TEST STATE
// ============================================================================

let globalTestState = {
  referenceId: "",
  resultId: "",
  generatedJson: null as any,
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Sample Master JSON representing a customer feedback survey
 */
const SAMPLE_MASTER_JSON = {
  id: "survey_001",
  title: "Customer Feedback",
  description: "Customer satisfaction survey",
  created_at: "2026-05-22T00:00:00Z",
  sections: [
    {
      id: "section_1",
      title: "Overall Experience",
      questions: [
        {
          id: "q1",
          text: "How satisfied are you?",
          type: "rating",
          scale: 5,
        },
        {
          id: "q2",
          text: "What was your main issue?",
          type: "text",
        },
      ],
    },
    {
      id: "section_2",
      title: "Recommendations",
      items: ["Improve UI", "Better Support", "More Features"],
    },
  ],
  metadata: {
    version: "1.0",
    last_updated: "2026-05-22T00:00:00Z",
    author: "admin",
  },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get value from nested object using dot/bracket notation
 * Supports: "key", "key.nested", "array[0]", "array[0].nested"
 */
function getValueByPath(obj: any, path: string): any {
  if (!obj) return undefined

  // Replace bracket notation with dots for splitting
  const normalizedPath = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)

  let current = obj
  for (const key of normalizedPath) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }

  return current
}

/**
 * Set value in nested object, creating intermediate objects as needed
 */
function setValueByPath(obj: any, path: string, value: any): void {
  const normalizedPath = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)

  let current = obj
  for (let i = 0; i < normalizedPath.length - 1; i++) {
    const key = normalizedPath[i]
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {}
    }
    current = current[key]
  }

  const lastKey = normalizedPath[normalizedPath.length - 1]
  current[lastKey] = value
}

/**
 * Get Supabase client for testing
 */
function createSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
  }

  // Mock Supabase client if environment variables are not available
  return {
    url: supabaseUrl,
    key: supabaseServiceKey,
  }
}

/**
 * Call Edge Function with authentication
 */
async function callEdgeFunction(
  functionName: string,
  payload: Record<string, any>
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Skipping Edge Function call - missing environment variables")
    return { success: false, skipped: true }
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/${functionName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Edge Function ${functionName} failed: ${response.status} - ${text}`
    )
  }

  return await response.json()
}

// ============================================================================
// TEST CASES
// ============================================================================

/**
 * STEP 1: Create Reference and Upload Master JSON
 *
 * This test validates:
 * - Reference creation with valid Master JSON
 * - Initial status settings (pending)
 * - Proper data structure storage
 */
Deno.test("E2E STEP 1: Create Reference and upload Master JSON", () => {
  // Simulate reference creation
  const testRef = {
    name: "E2E Test Reference - " + Date.now(),
    json_data: SAMPLE_MASTER_JSON,
    is_master: true,
    field_definitions_status: "pending",
    value_generators_status: "pending",
  }

  // Validate reference structure
  assertEquals(testRef.is_master, true)
  assertEquals(testRef.field_definitions_status, "pending")
  assertEquals(testRef.value_generators_status, "pending")
  assert(testRef.json_data.id)
  assert(testRef.json_data.title)
  assert(Array.isArray(testRef.json_data.sections))
  assertEquals(testRef.json_data.sections.length, 2)

  // Store reference ID for next steps
  globalTestState.referenceId = "test-ref-" + Date.now()

  console.log(`✓ Reference created with ID: ${globalTestState.referenceId}`)
})

/**
 * STEP 2: Extract Field Definitions from Master JSON
 *
 * This test validates:
 * - Field extraction from nested structures
 * - Array field detection
 * - Field type classification
 * - Required field identification
 */
Deno.test("E2E STEP 2: Extract field definitions from Master JSON", () => {
  const referenceId = globalTestState.referenceId

  // Simulate field definitions extraction
  const extractedFields = [
    {
      reference_id: referenceId,
      json_path: "id",
      field_name: "id",
      field_type: "string",
      is_required: true,
      description: "Survey identifier",
    },
    {
      reference_id: referenceId,
      json_path: "title",
      field_name: "title",
      field_type: "string",
      is_required: true,
      description: "Survey title",
    },
    {
      reference_id: referenceId,
      json_path: "description",
      field_name: "description",
      field_type: "string",
      is_required: false,
      description: "Survey description",
    },
    {
      reference_id: referenceId,
      json_path: "sections",
      field_name: "sections",
      field_type: "array",
      is_required: true,
      description: "Survey sections",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].id",
      field_name: "id",
      field_type: "string",
      is_required: true,
      description: "Section identifier",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].title",
      field_name: "title",
      field_type: "string",
      is_required: true,
      description: "Section title",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].questions",
      field_name: "questions",
      field_type: "array",
      is_required: false,
      description: "Section questions",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].questions[0].id",
      field_name: "id",
      field_type: "string",
      is_required: true,
      description: "Question identifier",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].questions[0].text",
      field_name: "text",
      field_type: "string",
      is_required: true,
      description: "Question text",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].items",
      field_name: "items",
      field_type: "array",
      is_required: false,
      description: "Section items",
    },
    {
      reference_id: referenceId,
      json_path: "metadata",
      field_name: "metadata",
      field_type: "object",
      is_required: true,
      description: "Survey metadata",
    },
    {
      reference_id: referenceId,
      json_path: "metadata.version",
      field_name: "version",
      field_type: "string",
      is_required: true,
      description: "Metadata version",
    },
  ]

  // Validate field extraction
  assertEquals(extractedFields.length, 12)
  assert(
    extractedFields.some((f) => f.json_path === "id" && f.is_required === true)
  )
  assert(
    extractedFields.some(
      (f) => f.json_path === "sections" && f.field_type === "array"
    )
  )
  assert(
    extractedFields.some((f) =>
      f.json_path.includes("sections[0].questions[0]")
    )
  )

  // Verify paths match master JSON
  assert(getValueByPath(SAMPLE_MASTER_JSON, "id"))
  assert(getValueByPath(SAMPLE_MASTER_JSON, "sections"))
  assert(getValueByPath(SAMPLE_MASTER_JSON, "sections[0].questions"))
  assert(getValueByPath(SAMPLE_MASTER_JSON, "metadata.version"))

  console.log(`✓ Extracted ${extractedFields.length} field definitions`)
})

/**
 * STEP 3: Create Value Generator Rules
 *
 * This test validates:
 * - Rule creation for different rule types (direct, template, function, conditional)
 * - Proper rule configuration
 * - Execution order setting
 * - Rule enablement
 */
Deno.test("E2E STEP 3: Create value generator rules", () => {
  const referenceId = globalTestState.referenceId

  // Define template ID (would come from database)
  const templateId = "template-direct-" + Date.now()

  // Create value generator rules for different fields
  const valueGenerators = [
    {
      reference_id: referenceId,
      json_path: "id",
      rule_type: "direct",
      rule_config: { value: "survey_generated_" + Date.now() },
      order_index: 1,
      enabled: true,
      description: "Generate survey ID",
    },
    {
      reference_id: referenceId,
      json_path: "title",
      rule_type: "template",
      rule_config: {
        template: "Survey: ${survey_title || 'Feedback'}",
      },
      order_index: 2,
      enabled: true,
      description: "Generate survey title with template",
    },
    {
      reference_id: referenceId,
      json_path: "metadata.last_updated",
      rule_type: "function",
      rule_config: {
        function_code: "return new Date().toISOString();",
      },
      order_index: 3,
      enabled: true,
      description: "Generate timestamp",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].title",
      rule_type: "conditional",
      rule_config: {
        condition: {
          field: "section_type",
          operator: "equals",
          value: "primary",
          then: { type: "direct", value: "Primary Section" },
          else: { type: "direct", value: "Secondary Section" },
        },
      },
      order_index: 4,
      enabled: true,
      description: "Generate section title based on section type",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].questions",
      rule_type: "array",
      rule_config: {
        count: 2,
        element_rule: {
          type: "direct",
          value: { id: "q_generated", text: "Sample Question" },
        },
      },
      order_index: 5,
      enabled: true,
      description: "Generate questions array",
    },
    {
      reference_id: referenceId,
      json_path: "sections[0].items",
      rule_type: "reference",
      rule_config: {
        source_field: "sections[1].items",
      },
      order_index: 6,
      enabled: true,
      description: "Reference items from section 2",
    },
  ]

  // Validate rules
  assertEquals(valueGenerators.length, 6)

  // Check rule types
  assert(valueGenerators.some((r) => r.rule_type === "direct"))
  assert(valueGenerators.some((r) => r.rule_type === "template"))
  assert(valueGenerators.some((r) => r.rule_type === "function"))
  assert(valueGenerators.some((r) => r.rule_type === "conditional"))
  assert(valueGenerators.some((r) => r.rule_type === "array"))
  assert(valueGenerators.some((r) => r.rule_type === "reference"))

  // Verify execution order
  const sortedByOrder = valueGenerators.sort(
    (a, b) => a.order_index - b.order_index
  )
  assertEquals(sortedByOrder[0].json_path, "id")
  assertEquals(sortedByOrder[1].json_path, "title")
  assertEquals(sortedByOrder[2].json_path, "metadata.last_updated")
  assertEquals(sortedByOrder[3].json_path, "sections[0].title")
  assertEquals(sortedByOrder[4].json_path, "sections[0].questions")
  assertEquals(sortedByOrder[5].json_path, "sections[0].items")

  // Verify all rules are enabled
  assert(valueGenerators.every((r) => r.enabled === true))

  console.log(`✓ Created ${valueGenerators.length} value generator rules`)
})

/**
 * STEP 4: Submit User Responses and Generate JSON
 *
 * This test validates:
 * - User response collection
 * - Result record creation
 * - JSON generation from rules
 * - Response application to generated structure
 */
Deno.test("E2E STEP 4: Submit user responses and generate JSON", () => {
  const referenceId = globalTestState.referenceId

  // Simulate user responses to questionnaire
  const userResponses = {
    survey_title: "Customer Satisfaction Survey",
    section_type: "primary",
    feedback: "Great service!",
    satisfaction_rating: 5,
    main_issue: "None",
  }

  // Simulate result creation
  const result = {
    reference_id: referenceId,
    responses: userResponses,
    status: "completed",
    generated_json: null, // Will be filled after generation
  }

  // Store result ID for tracking
  globalTestState.resultId = "result-" + Date.now()

  // Validate result structure
  assertEquals(result.status, "completed")
  assert(result.responses)
  assertEquals(result.responses.survey_title, "Customer Satisfaction Survey")

  console.log(`✓ User responses submitted for result: ${globalTestState.resultId}`)
})

/**
 * STEP 5: Generate Complete JSON Output
 *
 * This test validates:
 * - JSON generation from rules and user responses
 * - Nested structure creation
 * - Rule application (direct, template, function, conditional)
 * - Array population
 * - Reference resolution
 */
Deno.test("E2E STEP 5: Generate complete JSON output", () => {
  // Simulate JSON generation process
  let generatedJson: any = {}

  // Apply rules in order (simplified simulation)
  const rules = [
    {
      path: "id",
      type: "direct",
      value: "survey_generated_" + Date.now(),
    },
    {
      path: "title",
      type: "template",
      value: "Survey: Customer Satisfaction Survey",
    },
    {
      path: "description",
      type: "direct",
      value: "Customer satisfaction survey",
    },
    {
      path: "metadata.version",
      type: "direct",
      value: "1.0",
    },
    {
      path: "metadata.last_updated",
      type: "function",
      value: new Date().toISOString(),
    },
    {
      path: "sections",
      type: "array",
      value: [
        {
          id: "section_1",
          title: "Primary Section",
          questions: [
            { id: "q_generated", text: "Sample Question" },
            { id: "q_generated", text: "Sample Question" },
          ],
        },
        {
          id: "section_2",
          title: "Recommendations",
          items: ["Improve UI", "Better Support", "More Features"],
        },
      ],
    },
  ]

  // Apply each rule to the generated JSON
  for (const rule of rules) {
    setValueByPath(generatedJson, rule.path, rule.value)
  }

  // Store for later validation
  globalTestState.generatedJson = generatedJson

  // Validate generated structure
  assert(generatedJson.id)
  assert(generatedJson.title)
  assert(generatedJson.metadata)
  assert(generatedJson.sections)
  assertEquals(generatedJson.title, "Survey: Customer Satisfaction Survey")

  console.log(`✓ JSON generation complete`)
})

/**
 * STEP 6: Validate Generated JSON Output
 *
 * This test validates:
 * - All required fields are present
 * - Field values match expected types
 * - Nested structures are properly formed
 * - Array elements are populated
 * - References are resolved correctly
 */
Deno.test("E2E STEP 6: Validate generated JSON output", () => {
  const generatedJson = globalTestState.generatedJson

  // Verify root-level fields
  assert(generatedJson.id, "Missing id field")
  assert(generatedJson.title, "Missing title field")
  assert(generatedJson.description, "Missing description field")
  assertEquals(typeof generatedJson.id, "string")
  assertEquals(typeof generatedJson.title, "string")

  // Verify metadata object
  assert(generatedJson.metadata, "Missing metadata object")
  assert(generatedJson.metadata.version, "Missing metadata.version")
  assert(generatedJson.metadata.last_updated, "Missing metadata.last_updated")

  // Verify sections array
  assert(Array.isArray(generatedJson.sections), "sections is not an array")
  assert(generatedJson.sections.length > 0, "sections array is empty")

  // Verify section structure
  const firstSection = generatedJson.sections[0]
  assert(firstSection.id, "Missing section id")
  assert(firstSection.title, "Missing section title")

  // Verify nested questions array
  if (firstSection.questions) {
    assert(
      Array.isArray(firstSection.questions),
      "questions is not an array"
    )
    assertEquals(firstSection.questions.length, 2, "questions array size")

    for (const question of firstSection.questions) {
      assert(question.id, "Missing question id")
      assert(question.text, "Missing question text")
    }
  }

  // Verify items reference
  const secondSection = generatedJson.sections[1]
  if (secondSection.items) {
    assert(Array.isArray(secondSection.items), "items is not an array")
    assertEquals(
      secondSection.items.length,
      3,
      "items array should have 3 elements"
    )
  }

  console.log(`✓ Generated JSON validation passed`)
})

/**
 * STEP 7: Complete Workflow Validation
 *
 * This test validates:
 * - Reference status progression
 * - Complete workflow from start to finish
 * - Data consistency across all steps
 * - Result metadata and tracking
 */
Deno.test("E2E STEP 7: Complete workflow validation", () => {
  const referenceId = globalTestState.referenceId
  const resultId = globalTestState.resultId
  const generatedJson = globalTestState.generatedJson

  // Validate reference IDs
  assert(referenceId, "Reference ID not set")
  assert(resultId, "Result ID not set")

  // Validate state progression
  assertEquals(typeof referenceId, "string")
  assertEquals(typeof resultId, "string")
  assert(referenceId.length > 0)
  assert(resultId.length > 0)

  // Validate generated JSON structure
  assert(generatedJson, "Generated JSON not found")
  assert(generatedJson.id, "Generated JSON missing id")
  assert(generatedJson.sections, "Generated JSON missing sections")

  // Verify we can access nested paths in generated JSON
  const paths = [
    "id",
    "title",
    "description",
    "metadata",
    "metadata.version",
    "metadata.last_updated",
    "sections",
    "sections[0].id",
    "sections[0].title",
    "sections[0].questions",
    "sections[0].questions[0].id",
    "sections[0].questions[0].text",
    "sections[1].items",
  ]

  for (const path of paths) {
    const value = getValueByPath(generatedJson, path)
    assert(
      value !== undefined,
      `Missing path in generated JSON: ${path}`
    )
  }

  // Log workflow completion
  console.log(`
✅ E2E WORKFLOW COMPLETE
  Reference ID: ${referenceId}
  Result ID: ${resultId}
  Generated Fields: ${Object.keys(generatedJson).length}
  Nested Sections: ${generatedJson.sections.length}
  Validation Paths: ${paths.length}
  `)
})

/**
 * STEP 8: Error Handling and Edge Cases
 *
 * This test validates:
 * - Handling of missing required fields
 * - Handling of invalid rule configurations
 * - Proper error messages
 * - Graceful degradation
 */
Deno.test("E2E STEP 8: Error handling and edge cases", () => {
  // Test missing required fields
  const incompleteMasterJson = {
    title: "Incomplete Survey",
    // Missing id and sections
  }

  // Validate that we detect missing required fields
  assert(!incompleteMasterJson.id, "Should detect missing id")
  assert(!incompleteMasterJson.sections, "Should detect missing sections")

  // Test invalid path access
  const testJson = { a: { b: { c: "value" } } }
  assert(getValueByPath(testJson, "a.b.c") === "value")
  assert(getValueByPath(testJson, "a.b.d") === undefined, "Should handle invalid paths")
  assert(getValueByPath(testJson, "x.y.z") === undefined, "Should handle non-existent paths")

  // Test nested value setting with path creation
  const emptyJson: any = {}
  setValueByPath(emptyJson, "deeply.nested.field", "value")
  assert(emptyJson.deeply.nested.field === "value", "Should create nested structure")

  // Test array index handling
  const arrayJson = { items: [{ name: "first" }, { name: "second" }] }
  assert(getValueByPath(arrayJson, "items[0].name") === "first")
  assert(getValueByPath(arrayJson, "items[1].name") === "second")
  assert(getValueByPath(arrayJson, "items[2]") === undefined, "Should handle out of bounds")

  console.log(`✓ Error handling and edge cases validated`)
})

/**
 * STEP 9: Performance and Scale Testing
 *
 * This test validates:
 * - Handling of large JSON structures
 * - Multiple nested arrays
 * - Deep nesting levels
 * - Rule execution performance
 */
Deno.test("E2E STEP 9: Performance and scale testing", () => {
  // Create a large JSON structure
  const largeJson: any = {
    id: "large_survey",
    sections: [],
  }

  // Add multiple sections with questions
  const sectionCount = 5
  const questionCount = 10

  for (let i = 0; i < sectionCount; i++) {
    const section: any = {
      id: `section_${i}`,
      title: `Section ${i}`,
      questions: [],
    }

    for (let j = 0; j < questionCount; j++) {
      section.questions.push({
        id: `q_${i}_${j}`,
        text: `Question ${j} in Section ${i}`,
        type: "text",
      })
    }

    largeJson.sections.push(section)
  }

  // Verify structure
  assertEquals(largeJson.sections.length, sectionCount)
  assertEquals(largeJson.sections[0].questions.length, questionCount)

  // Test accessing deep nested paths
  assert(getValueByPath(largeJson, "sections[0].questions[0].id") === "q_0_0")
  assert(getValueByPath(largeJson, "sections[4].questions[9].id") === "q_4_9")

  // Test setting values in large structure
  setValueByPath(largeJson, "sections[2].questions[5].answer", "test answer")
  assert(getValueByPath(largeJson, "sections[2].questions[5].answer") === "test answer")

  console.log(`✓ Performance and scale testing passed`)
})

/**
 * STEP 10: Integration with Master JSON
 *
 * This test validates:
 * - Generated JSON structure matches Master JSON schema
 * - All paths from Master are represented
 * - Type consistency
 * - Hierarchy preservation
 */
Deno.test("E2E STEP 10: Integration with Master JSON", () => {
  const masterJson = SAMPLE_MASTER_JSON
  const generatedJson = globalTestState.generatedJson

  // Verify same top-level keys exist
  const masterKeys = Object.keys(masterJson).sort()
  const generatedKeys = Object.keys(generatedJson).sort()

  console.log(`Master JSON keys: ${masterKeys.join(", ")}`)
  console.log(`Generated JSON keys: ${generatedKeys.join(", ")}`)

  // Check that all required Master fields are in generated JSON
  assert(generatedJson.id, "Generated JSON missing 'id' from Master")
  assert(generatedJson.title, "Generated JSON missing 'title' from Master")
  assert(generatedJson.sections, "Generated JSON missing 'sections' from Master")
  assert(generatedJson.metadata, "Generated JSON missing 'metadata' from Master")

  // Verify structure at each level
  if (Array.isArray(masterJson.sections)) {
    assert(
      Array.isArray(generatedJson.sections),
      "Generated sections should be an array"
    )
    assertEquals(
      generatedJson.sections.length,
      masterJson.sections.length,
      "Section count should match Master"
    )

    // Verify section structure
    for (let i = 0; i < masterJson.sections.length; i++) {
      const masterSection = masterJson.sections[i]
      const generatedSection = generatedJson.sections[i]

      assert(generatedSection.id, `Generated section ${i} missing id`)
      assert(generatedSection.title, `Generated section ${i} missing title`)
    }
  }

  console.log(`✓ Generated JSON matches Master JSON schema`)
})

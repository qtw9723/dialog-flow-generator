import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildBundle } from "../../../src/lib/resultBundle/buildBundle.js"
import { CANONICAL_KEYS } from "../../../src/lib/resultBundle/contract.js"

// 생성기가 조립하는 키 집합이 계약과 어긋나지 않는지 고정한다.
// (실제 조립은 index.ts 안에서 일어나므로, 여기서는 같은 키 목록으로 계약을 검증한다.)
const GENERATOR_KEYS = [
  "design_ok", "expand_count", "field_definitions_loaded", "values_filled",
  "rules_executed", "rules_skipped", "nlp", "nlp_error", "scenario_name_resolution",
  "esd_schemas", "esd_error", "api_defs", "api_error", "loop_exit_normalized", "collection_loops",
  "validation_loops", "stripped_condition_nodes", "initialized_accumulators", "fallback_injected",
  "llm_blocks", "api_guard", "else_order_moved", "design_stats", "usage", "created_by",
  "scenario_examples", "rules_snapshot", "flow", "scenarios", "scenario_name_mismatch",
  "source", "esd", "esd_mapping", "esd_mapping_confirmed", "stage368_scenario_seeds",
]

Deno.test("생성기가 쓰는 키는 전부 계약에 선언돼 있다", () => {
  for (const k of GENERATOR_KEYS) {
    assert((CANONICAL_KEYS as string[]).includes(k), `${k}가 계약에 없다`)
  }
})

Deno.test("생성기 키 목록에 버려진 개수 키가 없다", () => {
  for (const dropped of ["tier3_rules_executed", "tier3_rules_skipped", "stage377_else_order_moved"]) {
    assertEquals(GENERATOR_KEYS.includes(dropped), false, `${dropped}이 아직 쓰인다`)
  }
})

Deno.test("생성기 키로 조립하면 필수 검사를 통과한다", () => {
  const bundle = (buildBundle as any)("generated", {
    flow: { nodes: [] },
    design_stats: { node_count: 1, llm_calls: 1, repaired: false, reprompted: false },
    usage: { total_tokens: 1 },
    created_by: "",
    rules_executed: [],
    rules_skipped: [],
  })
  assertEquals(bundle.created_by, "")
  assertEquals(bundle.rules_executed, [])
})

// index.ts가 실제로 레거시 키를 더 쓰지 않는지 소스에서 확인한다.
// (조립부만 계약을 거치고 중간 대입이 옛 이름으로 남으면 계약 밖 키가 저장된다.)
Deno.test("index.ts에 레거시 번호 키가 남아 있지 않다", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url))
  const legacy = [
    "tier1_learned", "tier2_structure_count", "tier2_field_definitions_loaded",
    "tier25_values_filled", "tier3_executed_rules", "tier3_skipped_rules",
    "tier3_rules_executed", "tier3_rules_skipped", "tier3_feature_mapping",
    "stage1_flow", "stage29_loop_exit_normalized", "stage295_collection_loops",
    "stage3_validation_loops", "stage35_stripped_condition_nodes",
    "stage36_initialized_accumulators", "stage365_fallback",
    "stage37_llm_blocks", "stage375_api_guard", "stage377_else_order_moved",
  ]
  const found = legacy.filter((k) => src.includes(k))
  assertEquals(found, [], `레거시 키가 남아 있다: ${found.join(", ")}`)
})

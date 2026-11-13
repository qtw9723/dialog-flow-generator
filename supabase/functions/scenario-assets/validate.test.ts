import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { validateAssetPayload, VALID_CATEGORIES } from "./validate.ts"
import { SCENARIO_CATEGORIES } from "../../../src/lib/scenarioCategories.js"

const good = {
  category: "금융", name: " 예약 시나리오 ", description: "설명",
  flow_json: { dialogs: [{ id: "main", then: [], nodes: [] }] },
  assets: { esd_schemas: [], nlp: { intents: [], entities: [] }, api_defs: [] },
  source_result_id: "11111111-1111-1111-1111-111111111111",
}

// 옛 버전은 같은 파일 안의 두 번째 리터럴과 비교해서 divergence를 **탐지할 수 없었다**.
// 이제 프론트가 실제로 쓰는 공유 모듈(src/lib/scenarioCategories.js — constants.js가 re-export)을
// import해 대조하므로, 한쪽만 늘면 여기서 깨진다.
Deno.test("VALID_CATEGORIES가 공유 목록(src/lib/scenarioCategories.js)에서 온다", () => {
  assertEquals(VALID_CATEGORIES, SCENARIO_CATEGORIES)
})

Deno.test("정상 페이로드는 통과하고 이름은 trim된다", () => {
  const r = validateAssetPayload(good)
  assertEquals(r.ok, true)
  if (r.ok) {
    assertEquals(r.value.name, "예약 시나리오")
    assertEquals(r.value.source_result_id, "11111111-1111-1111-1111-111111111111")
  }
})

Deno.test("모르는 카테고리는 거절한다", () => {
  const r = validateAssetPayload({ ...good, category: "우주" })
  assertEquals(r, { ok: false, error: "유효한 category가 필요합니다." })
})

Deno.test("이름이 비면 거절한다", () => {
  assertEquals(validateAssetPayload({ ...good, name: "   " }), { ok: false, error: "name이 필요합니다." })
})

Deno.test("flow_json이 객체가 아니면 거절한다", () => {
  assertEquals(validateAssetPayload({ ...good, flow_json: "x" }), { ok: false, error: "flow_json(JSON 객체)이 필요합니다." })
  assertEquals(validateAssetPayload({ ...good, flow_json: [] }), { ok: false, error: "flow_json(JSON 객체)이 필요합니다." })
})

Deno.test("assets가 없으면 빈 자산으로 채운다 — 자산 0건 시나리오도 등록된다", () => {
  const r = validateAssetPayload({ ...good, assets: undefined })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.value.assets, { esd_schemas: [], nlp: { intents: [], entities: [] }, api_defs: [] })
})

Deno.test("assets의 빠진 갈래는 빈 배열로 메운다", () => {
  const r = validateAssetPayload({ ...good, assets: { esd_schemas: [{ name: "예약" }] } })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.value.assets, {
    esd_schemas: [{ name: "예약" }], nlp: { intents: [], entities: [] }, api_defs: [],
  })
})

Deno.test("source_result_id는 선택 — 없으면 null", () => {
  const r = validateAssetPayload({ ...good, source_result_id: undefined })
  assertEquals(r.ok, true)
  if (r.ok) assertEquals(r.value.source_result_id, null)
})

Deno.test("본문이 객체가 아니면 거절한다", () => {
  assertEquals(validateAssetPayload(null), { ok: false, error: "요청 본문이 필요합니다." })
})

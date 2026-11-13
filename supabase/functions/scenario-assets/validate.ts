// scenario-assets 등록 페이로드 검증 (순수).
// index.ts가 최상단에서 serve()를 부르므로 핸들러를 떼어낼 seam이 없다 — 검증만 여기로 뺀다.

// 카테고리 목록의 유일 소스는 src/lib/scenarioCategories.js다 — 리터럴을 복제하지 않는다
// (이 저장소의 반복 실패 유형: 같은 목록이 여러 벌로 갈라져 한쪽만 바뀐다).
// ⚠ constants.js는 import.meta.env를 읽어 Deno에서 로드되지 않으므로 그쪽을 import하면 안 된다.
import { SCENARIO_CATEGORIES as VALID_CATEGORIES } from "../../../src/lib/scenarioCategories.js"
export { VALID_CATEGORIES }

export interface ScenarioAssetBundle {
  esd_schemas: unknown[]
  nlp: { intents: unknown[]; entities: unknown[] }
  api_defs: unknown[]
}

export interface AssetPayload {
  category: string
  name: string
  description: string
  flow_json: Record<string, unknown>
  assets: ScenarioAssetBundle
  source_result_id: string | null
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** 빠진 갈래를 빈 배열로 메운다 — 자산 0건 시나리오도 등록 가능해야 한다. */
export function normalizeAssets(raw: unknown): ScenarioAssetBundle {
  const a = isPlainObject(raw) ? raw : {}
  const nlp = isPlainObject(a.nlp) ? a.nlp : {}
  return {
    esd_schemas: arr(a.esd_schemas),
    nlp: { intents: arr(nlp.intents), entities: arr(nlp.entities) },
    api_defs: arr(a.api_defs),
  }
}

export function validateAssetPayload(
  body: unknown,
): { ok: true; value: AssetPayload } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "요청 본문이 필요합니다." }

  const category = String(body.category ?? "")
  if (!VALID_CATEGORIES.includes(category)) return { ok: false, error: "유효한 category가 필요합니다." }

  const name = String(body.name ?? "").trim()
  if (!name) return { ok: false, error: "name이 필요합니다." }

  if (!isPlainObject(body.flow_json)) return { ok: false, error: "flow_json(JSON 객체)이 필요합니다." }

  const sid = body.source_result_id
  return {
    ok: true,
    value: {
      category,
      name,
      description: String(body.description ?? ""),
      flow_json: body.flow_json,
      assets: normalizeAssets(body.assets),
      source_result_id: typeof sid === "string" && sid.trim() ? sid.trim() : null,
    },
  }
}

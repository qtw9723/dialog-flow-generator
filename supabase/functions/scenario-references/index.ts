import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { assembleScenarios, mergeScenarioAssets } from "./lib/assemble.ts"
import { buildBundle } from "../../../src/lib/resultBundle/buildBundle.js"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { SCENARIO_CATEGORIES } from "../../../src/lib/scenarioCategories.js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  })

// 카테고리 목록의 유일 소스는 src/lib/scenarioCategories.js다 — scenario-assets/validate.ts도
// 같은 모듈을 쓴다(리터럴 복제 금지). constants.js는 import.meta.env 때문에 Deno에서 못 읽는다.
const VALID_CATEGORIES = SCENARIO_CATEGORIES

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    // -dev 슬러그(scenario-references-dev)로 오면 dev_dialogflow_scenario_references를 읽고 쓴다.
    const T = tablePicker(isDevRequest(req.url))
    const url = new URL(req.url)
    const action = url.searchParams.get("action")
    const id = url.searchParams.get("id")
    const category = url.searchParams.get("category")

    // 조립: 여러 시나리오(기반 레퍼런스 + 사용자 자산) → 하나의 완전한 봇.
    // save:true면 결과 행으로 저장한다 — 결과 상세의 다운로드 UI(봇 JSON·ESD·NLP CSV)를
    // 그대로 쓰기 위해서다(확정 사항 5). save 없이 부르면 예전 그대로 flow_json만 돌려준다.
    if (req.method === "POST" && action === "assemble") {
      const body = await req.json().catch(() => ({})) as {
        items?: Array<{ kind?: string; id?: string }>
        ids?: string[]
        save?: boolean
        name?: string
      }
      // items가 새 형식, ids는 옛 형식(전부 레퍼런스).
      const items = Array.isArray(body.items) && body.items.length
        ? body.items.map((it) => ({ kind: it?.kind === "asset" ? "asset" : "reference", id: String(it?.id || "") }))
        : (Array.isArray(body.ids) ? body.ids : []).map((id: string) => ({ kind: "reference", id: String(id) }))
      const clean = items.filter((it) => it.id)
      if (clean.length === 0) return json({ error: "조립할 시나리오를 골라주세요." }, 400)

      const refIds = clean.filter((it) => it.kind === "reference").map((it) => it.id)
      const assetIds = clean.filter((it) => it.kind === "asset").map((it) => it.id)

      const rows = new Map<string, any>()
      if (refIds.length) {
        const { data, error } = await supabase
          .from(T("dialogflow_scenario_references")).select("id, name, flow_json").in("id", refIds)
        if (error) return json({ error: error.message }, 500)
        for (const r of data || []) rows.set(`reference:${r.id}`, r)
      }
      if (assetIds.length) {
        const { data, error } = await supabase
          .from(T("dialogflow_scenario_assets")).select("id, name, flow_json, assets").in("id", assetIds)
        if (error) return json({ error: error.message }, 500)
        for (const r of data || []) rows.set(`asset:${r.id}`, r)
      }

      // 고른 순서를 유지한다 — 첫 봇이 조립의 base(보일러플레이트 제공자)라 순서가 의미를 가진다.
      // ⚠ kind와 행을 **짝지어** 들고 간다. 못 찾은 행이 있으면 인덱스가 어긋나
      //    assembly.items에 엉뚱한 kind가 기록된다.
      const paired = clean
        .map((it) => ({ kind: it.kind, row: rows.get(`${it.kind}:${it.id}`) }))
        .filter((p) => p.row)
      if (paired.length === 0) return json({ error: "고른 시나리오를 찾을 수 없습니다." }, 404)
      const picked = paired.map((p) => p.row)

      const assembled = assembleScenarios(picked.map((r: any) => r.flow_json))
      const merged = mergeScenarioAssets(picked.map((r: any) => r.assets).filter(Boolean))
      const warnings = [...new Set([...assembled.warnings, ...merged.warnings])]
      if (!assembled.flow_json) return json({ flow_json: null, warnings }, 400)

      const botName = String(body.name || "").trim()
      if (botName) assembled.flow_json.name = botName

      if (!body.save) return json({ flow_json: assembled.flow_json, warnings })

      // 저장 경로 — 소유자는 호출자의 Supabase 세션. master 관리자는 세션이 없어 null이 된다
      // (그 경우 /results는 admin-results로 전체를 보므로 화면에서는 그대로 보인다).
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
      const { data: { user } } = await supabase.auth.getUser(token)
      const hasNlp = merged.assets.nlp.intents.length > 0 || merged.assets.nlp.entities.length > 0
      const row = {
        generated_json: assembled.flow_json,
        responses: {},          // NOT NULL — 조립물에는 원설문이 없다
        reference_id: null,     // 업로드본과 같은 자리. assembly가 조립물 표식이다.
        ...(user?.id ? { user_id: user.id } : {}),
        generation_tiers: buildBundle("assembled", {
          assembly: {
            assembled_at: new Date().toISOString(),
            items: paired.map((p) => ({ kind: p.kind, id: p.row.id, name: p.row.name })),
            warnings,
          },
          esd_schemas: merged.assets.esd_schemas.length ? merged.assets.esd_schemas : undefined,
          api_defs: merged.assets.api_defs.length ? merged.assets.api_defs : undefined,
          nlp: hasNlp ? merged.assets.nlp : undefined,
          created_by: user?.email || undefined,
        }),
      }
      const { data, error } = await supabase.from(T("dialogflow_results")).insert(row).select("*").single()
      if (error) return json({ error: error.message }, 500)
      return json({ result: data, warnings }, 201)
    }

    // 목록 (공개) — 라이브러리·생성기 공용
    if (req.method === "GET") {
      let q = supabase.from(T("dialogflow_scenario_references")).select("*").order("category").order("order_index")
      if (category) q = q.eq("category", category)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json(data || [])
    }

    // 생성 (어드민)
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}))
      const { category, name, description, flow_json, order_index } = body
      if (!category || !VALID_CATEGORIES.includes(category)) return json({ error: "유효한 category가 필요합니다." }, 400)
      if (!name || typeof name !== "string") return json({ error: "name이 필요합니다." }, 400)
      if (!flow_json || typeof flow_json !== "object") return json({ error: "flow_json(JSON 객체)이 필요합니다." }, 400)
      const { data, error } = await supabase
        .from(T("dialogflow_scenario_references"))
        .insert([{ category, name: name.trim(), description: description || "", flow_json, order_index: order_index || 0 }])
        .select().single()
      if (error) return json({ error: error.message }, 500)
      return json(data, 201)
    }

    // 수정 (어드민)
    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({}))
      const { id: bid, ...fields } = body
      if (!bid) return json({ error: "id가 필요합니다." }, 400)
      if (fields.category && !VALID_CATEGORIES.includes(fields.category)) return json({ error: "유효한 category가 아닙니다." }, 400)
      const patch: any = { updated_at: new Date().toISOString() }
      for (const k of ["category", "name", "description", "flow_json", "order_index"]) if (k in fields) patch[k] = fields[k]
      const { data, error } = await supabase
        .from(T("dialogflow_scenario_references")).update(patch).eq("id", bid).select().single()
      if (error) return json({ error: error.message }, 500)
      return json(data)
    }

    // 삭제 (어드민)
    if (req.method === "DELETE") {
      if (!id) return json({ error: "id가 필요합니다." }, 400)
      const { error } = await supabase.from(T("dialogflow_scenario_references")).delete().eq("id", id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: "Method not allowed" }, 405)
  } catch (err) {
    console.error("[scenario-references] error:", err)
    return json({ error: (err as Error).message || "Unexpected error" }, 500)
  }
})

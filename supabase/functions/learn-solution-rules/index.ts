import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { relevantExistingRules, stagesForCategory } from "./lib/categories.ts"
import { buildDerivePrompt, buildReconcilePrompt, parseLlm } from "./lib/prompts.ts"
import { Decision, planApply } from "./lib/apply.ts"
import { llmErrorMessage } from "../_shared/llmError.ts"
import { LLM_MODEL } from "../_shared/llmModel.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

async function callLlm(prompt: string): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY")
  if (!key) throw new Error("OPENAI_API_KEY 미설정")
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!resp.ok) throw new Error(llmErrorMessage(resp.status, await resp.text().catch(() => "")))
  const data = await resp.json()
  return data?.choices?.[0]?.message?.content || ""
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const action = new URL(req.url).searchParams.get("action")

    if (req.method === "POST" && action === "analyze") {
      const { source, input } = await req.json().catch(() => ({}))
      if (!input || (source !== "text" && source !== "json")) return json({ error: "source('text'|'json')와 input이 필요합니다." }, 400)

      // 1) 후보 도출
      const derived = parseLlm(await callLlm(buildDerivePrompt(source, String(input))))
      const rawCandidates = Array.isArray(derived?.candidates) ? derived.candidates : []
      if (rawCandidates.length === 0) return json({ error: "규칙 후보를 도출하지 못했습니다.", candidates: [] }, 200)

      // 2) 기존 규칙 로드
      const { data: existRows } = await supabase.from("solution_rules").select("id, category, title, description")
      const existing = (existRows || []).map((r: any) => ({ id: String(r.id), category: r.category, title: r.title, description: r.description }))

      // 3) 정합화 — 후보별 같은 stage 기존 규칙과 비교
      const candidates = []
      for (let i = 0; i < rawCandidates.length; i++) {
        const cand = rawCandidates[i]
        const relevant = relevantExistingRules(cand.category, existing)
        let conflict = { type: "none", action: "add", targetRuleId: "", targetTitle: "", targetDescription: "", rationale: "", mergedDescription: "" }
        if (relevant.length) {
          const rec = parseLlm(await callLlm(buildReconcilePrompt([cand], relevant)))
          const r = Array.isArray(rec?.results) ? rec.results[0] : null
          if (r && typeof r === "object") {
            const target = relevant.find((x) => x.id === String(r.targetRuleId || ""))
            conflict = {
              type: ["none", "duplicate", "conflict", "refine"].includes(r.type) ? r.type : "none",
              action: ["add", "replace", "skip"].includes(r.action) ? r.action : "add",
              targetRuleId: target ? target.id : "",
              targetTitle: target ? target.title : "",
              targetDescription: target ? (target.description || "") : "",
              rationale: String(r.rationale || ""),
              mergedDescription: String(r.mergedDescription || ""),
            }
          }
        }
        candidates.push({
          tempId: `c${i}`,
          category: cand.category,
          title: cand.title || "",
          description: cand.description || "",
          content: cand.content && typeof cand.content.text === "string" ? cand.content : { text: cand.title || "" },
          stages: stagesForCategory(cand.category),
          conflict,
        })
      }
      return json({ candidates })
    }

    if (req.method === "POST" && action === "apply") {
      const { decisions } = await req.json().catch(() => ({}))
      if (!Array.isArray(decisions)) return json({ error: "decisions 배열이 필요합니다." }, 400)

      const { data: existRows } = await supabase.from("solution_rules").select("id, category, order_index")
      const existing = (existRows || []).map((r: any) => ({ id: String(r.id), category: r.category, order_index: r.order_index }))
      const plan = planApply(decisions as Decision[], existing)

      let added = 0, updated = 0, skipped = 0
      const errors = [...plan.errors]
      for (const op of plan.ops) {
        try {
          if (op.op === "insert") {
            const { error } = await supabase.from("solution_rules").insert([op.row])
            if (error) { errors.push(error.message); continue }
            added++
          } else if (op.op === "update") {
            const { error } = await supabase.from("solution_rules").update({ ...op.patch, updated_at: new Date().toISOString() }).eq("id", op.id)
            if (error) { errors.push(error.message); continue }
            updated++
          } else { skipped++ }
        } catch (e) { errors.push((e as Error).message) }
      }
      return json({ applied: { added, updated, skipped }, errors })
    }

    return json({ error: "지원하지 않는 요청. ?action=analyze|apply (POST)" }, 404)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

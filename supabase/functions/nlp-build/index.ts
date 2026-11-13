// nlp-build — 자연어 업무 설명에서 NLP 학습 데이터를 만든다 (v0.10.0 항목 3).
//
// 입력: { step: 'intents' | 'entities', description, intents? }
// 출력: intents 단계 → { intents }, entities 단계 → { entities, intents }
//       entities 단계가 intents를 함께 돌려주는 이유: 2단계에서 사용자가 편집한 이름을
//       intentName.ts 규칙으로 정규화해 화면에 되돌려야 CSV가 정규 이름을 받는다.
// 동작: LLM 1회 호출 → 정규화 → 반환. **DB를 읽지도 쓰지도 않는다.**
//
// 📄 함수 본문에서 사용자 인증을 하지 않는다 — 소유권을 따질 대상이 없다.
//    같은 성격의 nl-scenario-parse·poc-doc-parse도 그렇다. 게이트웨이 JWT 검증과
//    프론트 RequireAuth가 막는다. devTables도 쓰지 않는다(고를 테이블이 없다).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { validateRequest } from "./validate.ts"
import type { NlpBuildBody } from "./validate.ts"
import { buildIntentPrompt, buildEntityPrompt, finalizeIntents } from "./prompts.ts"
import { normalizeNlpBundle } from "../_shared/deriveNlpData.ts"
import { llmErrorMessage } from "../_shared/llmError.ts"
import { LLM_MODEL } from "../_shared/llmModel.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status })

async function callLlm(prompt: string): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY")
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.")
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: "user", content: prompt }] }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(llmErrorMessage(res.status, detail))
  }
  const data = await res.json()
  return String(data?.choices?.[0]?.message?.content ?? "")
}

/** LLM 응답에서 JSON 객체를 꺼낸다. 조용히 빈 결과로 위장하지 않고 throw한다. */
function parseJsonObject(text: string): unknown {
  const raw = String(text || "")
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`LLM 응답에서 JSON 객체를 찾지 못했습니다. 응답 앞부분: ${JSON.stringify(raw.slice(0, 200))}`)
  try {
    return JSON.parse(match[0])
  } catch (e) {
    throw new Error(`JSON 파싱 실패 — ${e instanceof Error ? e.message : String(e)}`)
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "POST만 지원합니다." }, 405)

  const body = await req.json().catch(() => null) as NlpBuildBody | null
  const invalid = validateRequest(body)
  if (invalid) return json({ error: invalid }, 400)

  const description = String(body!.description).trim()
  try {
    if (body!.step === "intents") {
      const parsed = parseJsonObject(await callLlm(buildIntentPrompt(description)))
      const intents = finalizeIntents(parsed)
      console.log(`[nlp-build] intents ${intents.length}, utterances ${intents.reduce((n, i) => n + i.examples.length, 0)}`)
      return json({ intents })
    }
    const requested = (body!.intents || []).map((it) => ({
      name: String(it?.name ?? "").trim(),
      examples: (it?.examples || []).map((e) => String(e ?? "").trim()).filter(Boolean),
    })).filter((it) => it.name) // 도달 불가 방어선 — validateRequest가 빈 이름을 이미 막는다.
    // 화면에서 편집된 이름이 CSV로 직행하지 않도록 여기서 정규화한다.
    // 이름 규칙의 유일 소스는 intentName.ts다 — 화면에 정규식을 복제하지 않는다.
    const intents = finalizeIntents({ intents: requested })
    if (intents.length === 0) {
      return json({ error: "인텐트 이름에 쓸 수 있는 문자가 없습니다. 이름을 고쳐 주세요." }, 400)
    }
    const parsed = parseJsonObject(await callLlm(buildEntityPrompt(description, intents)))
    const entities = normalizeNlpBundle(parsed).entities
    console.log(`[nlp-build] entities ${entities.length} (정규화 인텐트 ${intents.length})`)
    // intents도 함께 돌려준다 — 화면이 이것을 채택해야 CSV가 항상 정규 이름을 받는다.
    return json({ entities, intents })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[nlp-build] 실패:", msg)
    return json({ error: msg }, 502)
  }
})

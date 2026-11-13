import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { normalizeExtracted, buildExtractionPrompt } from "../../../src/lib/pocDoc/parseDocResponse.ts"
import { renderLayoutGuide, renderConfirmedColumns } from "../../../src/lib/pocDoc/termDictionary.ts"
import { callOpenAiChat } from "../_shared/llmCall.ts"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { planLearnWrites, validateLearnable } from "./learnTerms.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

// 문서 용어 사전(solution_rules의 'Document Term Mapping') 조회.
// 조회 실패가 추출을 막지 않는다 — 지침 없이도 자연어 인식은 동작한다.
// 다만 조용히 넘어가지 말고 로그를 남긴다(이 저장소가 반복해 다친 "조용한 실패").
// deno-lint-ignore no-explicit-any
async function loadTermEntries(supabase: any, tableName: string): Promise<unknown[]> {
  const { data, error } = await supabase
    .from(tableName).select("content")
    .eq("category", "Document Term Mapping").order("order_index")
  if (error) {
    console.error("[poc-doc-parse] 용어 사전 조회 실패:", tableName, error.message)
    return []
  }
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => r.content)
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { text, columnMapping, dictionaryOnly } = await req.json() as {
      text?: string
      columnMapping?: unknown
      dictionaryOnly?: boolean
    }

    // 사전 조회 전용 요청 — text 검증·OPENAI_API_KEY 검사보다 먼저 처리한다.
    // LLM을 부르지 않으므로 text가 없어도 되고 API 키도 필요 없다.
    // 프론트(열 매핑 확인 화면)가 자동 제안용으로 사전만 받아가는 경로.
    if (dictionaryOnly === true) {
      const T = tablePicker(isDevRequest(req.url))  // DEV 슬러그(-dev)면 dev_ 테이블 사용
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!)
      const entries = await loadTermEntries(supabase, T("solution_rules"))
      return new Response(JSON.stringify({ entries }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!text || typeof text !== "string" || text.trim() === "") {
      return new Response(
        JSON.stringify({ error: "text 필드가 필요합니다 (비어있지 않은 문자열)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const T = tablePicker(isDevRequest(req.url))  // DEV 슬러그(-dev)면 dev_ 테이블 사용
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!)
    const entries = await loadTermEntries(supabase, T("solution_rules"))

    // HTTP 오류·잘린 응답은 callOpenAiChat이 던진다 — 아래 최상위 catch가 500으로 내려보낸다
    // (예전엔 실패가 빈 결과로 흡수됐다).
    const prompt = buildExtractionPrompt(text, {
      layoutGuide: renderLayoutGuide(entries),
      confirmedColumns: renderConfirmedColumns(columnMapping),
    })
    const rawContent = await callOpenAiChat({ apiKey: openaiApiKey, prompt, temperature: 0.2 })
    const extracted = normalizeExtracted(rawContent)

    // 확정 매핑에서 새 용어를 사전에 반영한다. 실패해도 추출 결과는 그대로 돌려준다.
    // 서비스 롤로 쓰므로 validateLearnable을 반드시 거친다.
    // ⚠ dev 슬러그 요청이면 반드시 dev_ 테이블(T("solution_rules"))에 써야 한다 —
    //   프로덕션 사전에 쓰면 격리가 깨지고 읽기 오염과 달리 되돌리기 어렵다.
    const learnTableName = T("solution_rules")
    if (entries.length === 0) {
      // planLearnWrites도 entries가 비면 빈 배열을 돌려주므로 아래는 실제로 아무것도 쓰지 않는다.
      // 이 로그는 운영 가시성용이고, 핵심 가드 자체는 learnTerms.ts의 planLearnWrites 안에
      // 있으며 단위 테스트(entries=[] 또는 null → [])로 고정돼 있다 — index.ts 안에 두면
      // 이 저장소의 테스트 스위트(HTTP 핸들러를 감싸지 못함)로는 회귀를 잡을 수 없기 때문이다.
      console.error("[poc-doc-parse] 사전을 읽지 못해 학습을 건너뜁니다:", learnTableName)
    }
    const learnable = validateLearnable(columnMapping, entries)
    // "무엇을 쓸지" 결정은 순수 함수(planLearnWrites)에 맡긴다 — entries 빈 값 가드,
    // 필드별 묶기(중복 덮어쓰기 방지), 필드당 상한, content 병합이 전부 거기 있고
    // 전부 단위 테스트로 고정돼 있다. 이 함수는 console을 부르지 않는다(순수성 유지) —
    // 그래서 건너뛴 필드(skipped)는 여기서 로그로 남긴다. 여기(index.ts)는 실제 DB
    // 쓰기와 그 결과 로그, 그리고 skipped 로그만 맡는다.
    const plan = planLearnWrites(entries, learnable)
    for (const s of plan.skipped) {
      // 시드 행이 없는 필드(예: 외부 연동)나 필드당 상한 도달을 조용히 버리지 않는다 —
      // 이전 라운드에서 이 로그가 빠져 "외부 연동" 학습이 항상 0건·무로그였다.
      console.error("[poc-doc-parse] 용어 학습 건너뜀:", learnTableName, s.field, s.reason)
    }
    if (plan.writes.length > 0) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
        for (const w of plan.writes) {
          const { data, error } = await admin.from(learnTableName)
            .update({ content: w.content })
            .eq("category", "Document Term Mapping").eq("title", w.field)
            .select()
          if (error) {
            console.error("[poc-doc-parse] 용어 학습 쓰기 실패:", learnTableName, w.field, error.message)
          } else if (!data || data.length === 0) {
            // (category,title)에 unique 제약이 없어 title이 어긋나면 에러 없이 조용한
            // no-op이 될 수 있다 — 영향 행 수를 확인해 반드시 로그로 드러낸다.
            console.error("[poc-doc-parse] 용어 학습 쓰기: 행을 찾지 못함(title 불일치 의심):", learnTableName, w.field)
          } else if (data.length > 1) {
            console.error(
              "[poc-doc-parse] 용어 학습 쓰기: 여러 행이 갱신됨(category+title 중복 의심):",
              learnTableName, w.field, data.length,
            )
          }
        }
      } catch (e) {
        console.error("[poc-doc-parse] 용어 학습 실패(무시하고 계속):", learnTableName, e)
      }
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[poc-doc-parse] error:", msg, err)
    return new Response(
      JSON.stringify({ error: msg, detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

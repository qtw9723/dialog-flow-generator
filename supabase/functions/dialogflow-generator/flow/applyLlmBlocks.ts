// applyLlmBlocks: AI 자유응답(LLM) 블록 적용 (결정론적 안전장치)
// 질문지의 'AI 자유응답' 선택(collectLlmUsage)에 따라
// - 메뉴형: Main에 llmchat이 없으면 루트로 주입(fallback 앞)
// - 폴백형: fallback_out(고정 안내 output)을 llmchat으로 치환
// - 정규화(항상): 모든 llmchat에 apiKey="" 강제 — 레퍼런스 json_data의 실키가
//   파생 example/fill을 타고 생성물로 새는 경로를 차단. 규칙 아닌 안전 불변식 → 코드 유지.
// v0.2.0 범위: 단순 응대 블록만(tool/docquery/_llm.terminate 없음 — 스펙 참고).

import { buildLlmFlowChain, CollectItem } from "./llmFlowChain.ts"

// 지식소스: docs=문서 검색(docquery 앱 — 내부 정보만) / general=LLM 일반 답변 / mixed=문서 우선+일반 보완.
// 기본 general — docquery는 storeId(사용자 지정) 없이는 런타임 실패하므로 명시 선택일 때만 도구를 붙인다.
export type KnowledgeSource = "docs" | "general" | "mixed"

export function parseKnowledgeSource(label: unknown): KnowledgeSource {
  const s = String(label || "")
  if (s.includes("혼합")) return "mixed"   // "혼합(문서 우선…)"에 '문서'가 포함되므로 혼합 먼저 판별
  if (s.includes("문서")) return "docs"
  return "general"
}

export interface LlmUsage { menu: boolean; fallback: boolean; topic: string; source: KnowledgeSource }
// 제작한 챗봇의 시나리오 상세 — 프롬프트의 '챗봇 정보'에 넣어 LLM이 이 봇의 실체를 알고 답하게 한다.
// llmUse/llmSource: 시나리오 필드 "AI 자유응답 사용"/"AI 지식소스" — 이 시나리오 끝에 Q&A llmchat을 붙일지.
export interface ScenarioDetail {
  name: string; trigger: string; collects: string[]; result: string
  // 갈림길 설명(자연어). 발화로 갈리는 분기를 NLP 분류 엔티티로 만들려면 이게 필요하다(v0.8.1).
  branches?: string[]
  llmUse?: boolean; llmSource?: KnowledgeSource
  items?: CollectItem[]   // 수집 항목 상세 — 수집형 LLM 시나리오의 체인 생성 재료
  // 갈래에 하위 흐름(단계)이 있는 시나리오 — 수집형 LLM 체인(항목을 평평하게 잇는다)으로 갈아엎으면 갈래 구조가 사라지므로 교체하지 않는다.
  hasSubflow?: boolean
}

// 단계 목록 안 어느 분기 갈래든(중첩 포함) 하위 단계가 있으면 true.
function hasBranchSubflow(steps: any): boolean {
  if (!Array.isArray(steps)) return false
  return steps.some((st: any) => st?.["유형"] === "분기" && Array.isArray(st?.["갈래"]) &&
    st["갈래"].some((r: any) => Array.isArray(r?.["단계"]) && (r["단계"].length > 0 || hasBranchSubflow(r["단계"]))))
}
export interface LlmPromptContext {
  botName?: string; topic?: string; intent?: string; industry?: string; tone?: string
  features?: string[]   // 시나리오 이름 목록(요약) — scenarios가 없을 때의 폴백
  scenarios?: ScenarioDetail[]   // 시나리오 상세(진입 발화·수집 항목·완료 결과)
  source?: KnowledgeSource       // 이 llmchat의 지식소스(기본 general)
  scenarioName?: string          // 시나리오 전담 Q&A일 때 그 시나리오 이름(주제 한정)
  // applyScenarioSeeds이 레퍼런스 구조로 이미 시드한 시나리오 이름 집합(index.ts가 seedResult에서 성공분만 전달).
  // 수집형 LLM 체인 교체(items≥1)가 이 시나리오의 서브트리를 갈아엎으면 시드가 소실되므로,
  // 여기 있으면 체인 교체를 스킵하고 items==0 경로(잎 뒤 Q&A llmchat append)로 처리한다.
  seededScenarioNames?: Set<string>
}

// 질문 텍스트 접두사로 감지 — 마이그레이션의 질문 텍스트와 공유하는 계약.
const QUESTION_PREFIX = "AI 자유응답"
const SOURCE_QUESTION_PREFIX = "AI 지식소스"
const MODE_MENU = "메뉴 항목으로 추가"
const MODE_FALLBACK = "기타 질문 응대(폴백)"
const MODE_BOTH = "둘 다"

export function collectLlmUsage(responses: Record<string, any>, questions: any[]): LlmUsage {
  let mode = ""
  let topic = ""
  let sourceLabel = ""
  for (const q of questions || []) {
    const text = String(q?.text || "")
    const answer = responses?.[q.id]
    if (typeof answer !== "string") continue
    if (text.startsWith(SOURCE_QUESTION_PREFIX)) sourceLabel = answer.trim()
    else if (text.startsWith(QUESTION_PREFIX)) {
      if (q.input_type === "select") mode = answer.trim()
      else topic = answer.trim()
    }
  }
  return {
    menu: mode === MODE_MENU || mode === MODE_BOTH,
    fallback: mode === MODE_FALLBACK || mode === MODE_BOTH,
    topic,
    source: parseKnowledgeSource(sourceLabel),
  }
}

// 응답에서 시나리오(기능) 이름 목록을 결정론적으로 수집 — 프롬프트의 '챗봇 정보'용.
export function collectScenarioNames(responses: Record<string, any>): string[] {
  return collectScenarioDetails(responses).map((s) => s.name)
}

// 응답에서 시나리오 상세(진입 발화·수집 항목·완료 결과)를 결정론적으로 수집 —
// "제작한 챗봇의 정보"를 llmchat prompt에 넣어 그걸 기반으로 답하게 하기 위함.
export function collectScenarioDetails(responses: Record<string, any>): ScenarioDetail[] {
  const details: ScenarioDetail[] = []
  for (const v of Object.values(responses || {})) {
    if (!Array.isArray(v)) continue
    for (const scen of v) {
      const name = scen?.["시나리오 이름"]
      if (typeof name !== "string" || !name.trim()) continue
      const rawCollects = Array.isArray(scen?.["수집 정보"]) ? scen["수집 정보"] : []
      const collects = rawCollects
        .map((c: any) => {
          const item = String(c?.["항목명"] || "").trim()
          if (!item) return ""
          const req = String(c?.["필수 여부"] || "").trim()
          return req ? `${item}(${req})` : item
        })
        .filter(Boolean)
      // 수집 항목 상세 — 수집형 LLM 시나리오의 체인 생성 재료(변수명·형식·필수·되묻는 말).
      const items: CollectItem[] = rawCollects
        .filter((c: any) => String(c?.["항목명"] || "").trim())
        .map((c: any) => ({
          label: String(c["항목명"]).trim(),
          varName: String(c?.["변수명"] || "").trim(),
          required: String(c?.["필수 여부"] || "").trim() === "필수",
          format: String(c?.["입력 형식"] || "").trim() || "자유텍스트",
          reask: String(c?.["없을 때 되묻는 말"] || "").trim(),
        }))
      // 분기 설명 — "직접 입력 조건"이 있으면 그것, 없으면 조건대상/연산자/값을 합쳐 한 줄로.
      const branches: string[] = (Array.isArray(scen?.["분기"]) ? scen["분기"] : [])
        .map((b: any) => {
          const free = String(b?.["직접 입력 조건"] || "").trim()
          const target = String(b?.["조건 대상"] || "").trim()
          const op = String(b?.["연산자"] || "").trim()
          const val = String(b?.["값"] || "").trim()
          const cond = free || [target, op, val].filter((x) => x && x !== "직접 입력").join(" ")
          const action = String(b?.["그 경우 봇의 행동"] || "").trim()
          if (!cond && !action) return ""
          return action ? `${cond || "(조건 미기재)"} → ${action}` : cond
        })
        .filter(Boolean)
      details.push({
        name: name.trim(),
        trigger: String(scen?.["진입 발화"] || "").trim(),
        collects,
        ...(branches.length ? { branches } : {}),
        result: String(scen?.["완료 시 결과"] || "").trim(),
        llmUse: String(scen?.["AI 자유응답 사용"] || "").trim() === "예",
        llmSource: parseKnowledgeSource(scen?.["AI 지식소스"]),
        items,
        hasSubflow: hasBranchSubflow(scen?.["단계"]),
      })
    }
  }
  return details
}

// 결정론적 프롬프트 템플릿(LLM 0콜, 재현 가능). fillNodeValues가 채운 prompt가 있으면 쓰지 않는다.
// 구조는 레퍼런스 'LLM 노드 샘플'의 섹션 방식(챗봇 성향/챗봇 정보/응답 지침)을 따른다:
// 챗봇 정보를 나열해 주고, 기존 시나리오와 무관한 질문에는 시나리오를 답습하지 않고
// 그 정보를 활용해 새로 답하게 한다. (백틱 래핑은 정규화 단계가 보장.)
export function buildLlmPrompt(ctx: LlmPromptContext): string {
  const name = (ctx.botName || "").trim() || "챗봇"
  const tone = (ctx.tone || "").trim()
  const intent = (ctx.intent || "").trim()
  const industry = (ctx.industry || "").trim()
  const topic = (ctx.topic || "").trim()
  const scenarios = ctx.scenarios || []
  const features = (ctx.features || []).map((s) => String(s || "").trim()).filter(Boolean)
  // 제공 기능: 상세(scenarios)가 있으면 시나리오별 진입 발화·수집·완료까지 나열 — 이 봇의 실체가 프롬프트의 근거가 된다.
  const featureLines = scenarios.length
    ? ["- 제공 기능(시나리오):", ...scenarios.map((s, i) => {
        const parts = [
          s.trigger ? `진입 발화: "${s.trigger}"` : "",
          s.collects.length ? `수집 정보: ${s.collects.join(", ")}` : "",
          s.result ? `완료 시: "${s.result}"` : "",
        ].filter(Boolean).join(" / ")
        return `  ${i + 1}) ${s.name}${parts ? ` — ${parts}` : ""}`
      })]
    : (features.length ? [`- 제공 기능(시나리오): ${features.join(", ")}`] : [])
  const source: KnowledgeSource = ctx.source || "general"
  const scenarioName = (ctx.scenarioName || "").trim()
  const topicLine = scenarioName
    ? `- 답변 주제: 시나리오 "${scenarioName}" 관련 문의 (이 주제에 한정)`
    : `- 답변 주제: ${topic || "(지정 없음 — 위 챗봇 정보 전반)"}`
  const info = [
    intent ? `- 소개: ${intent}` : "",
    industry ? `- 산업군: ${industry}` : "",
    ...featureLines,
    topicLine,
  ].filter(Boolean).join("\n")

  // 지식소스별 섹션·지침 — docs=내부 문서 한정 / general=도구 없이 일반 지식 / mixed=문서 우선+보완.
  const toolSection = source === "general" ? [] : [
    "## 도구 사용(문서 검색)",
    source === "docs"
      ? "- 답변은 반드시 ask_docs 도구로 검색한 문서 내용을 근거로만 작성한다(내부 문서 정보 한정 — 그 외 지식으로 답하지 않는다)."
      : "- 우선 ask_docs 도구로 문서를 검색해 찾은 내용을 근거로 답한다.",
    "- query는 질문 문장을 그대로 쓰지 말고, 의미를 유지하는 한국어 핵심 명사·키워드만 남겨 만든다.",
    source === "docs"
      ? "- 문서에서 답을 찾지 못하면 no_answer 도구를 실행한다."
      : "- 문서에 없으면 일반 지식으로 보완하되, 문서 근거와 구분되게 표현한다. 문서에도 지식에도 없으면 no_answer 도구를 실행한다.",
    '- 도구는 한 번에 하나만 호출한다("ask_docs" 또는 "no_answer").',
    "",
  ]
  const sourceGuideline = source === "general"
    ? "- 별도 문서 검색 없이, 위 '챗봇 정보'와 너의 일반 지식으로 답한다."
    : null
  const scenarioGuideline = scenarioName
    ? `- 너는 시나리오 "${scenarioName}"를 진행한 사용자의 후속 질문을 전담하는 Q&A 상담원이다.`
    : null

  return [
    "## 챗봇 성향",
    `- 너는 "${name}"의 AI 상담원이다.`,
    `- 항상 친절하고 정중하게 답한다.${tone ? ` 말투: ${tone}.` : ""}`,
    "",
    "## 챗봇 정보",
    info,
    "",
    ...toolSection,
    "## 응답 지침",
    ...(scenarioGuideline ? [scenarioGuideline] : []),
    "- 위 '챗봇 정보'에 적힌 이 챗봇의 실제 정보를 근거로 답한다. 답변 주제가 지정돼 있으면 그 주제에 집중한다.",
    ...(sourceGuideline ? [sourceGuideline] : []),
    "- 사용자 요청이 위 '제공 기능(시나리오)'로 처리 가능하면 직접 처리하려 하지 말고, 해당 시나리오의 진입 발화를 입력하도록 안내한다.",
    "- 기존 시나리오(제공 기능)와 무관한 완전히 다른 질문이면, 시나리오의 흐름·멘트를 답습하지 말고 챗봇 정보를 바탕으로 새로 답한다.",
    "- 모르는 내용은 지어내지 말고, 답하기 어렵다고 정중히 안내한다.",
    "- 답변은 한국어로 간결하게 한다.",
  ].join("\n")
}

// 레퍼런스("LLM 노드 샘플"·샘플 보험사 LLM 봇)의 llmchat 도구 정의 골격.
// ask_docs = 문서 검색(LLM이 스스로 답하지 않고 근거 조회), no_answer = 못 찾았을 때 안내.
const LLM_TOOL_DEFS = `[{
    "name": "ask_docs",
    "description": "어떤 질문이든 LLM이 스스로 답하지 않고, 반드시 문서를 검색해 찾은 내용을 근거로 답한다.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "사용자 질문의 핵심 키워드로 문서를 검색한다. 실행 필수."
            }
        },
        "required": ["query"]
    }
}, {
    "name": "no_answer",
    "description": "문서에서 답을 찾지 못했을 때 안내를 위해 실행한다.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "추가 정보를 찾지 못한 경우 실행한다."
            }
        },
        "required": ["query"]
    }
}]`

// docquery 공통 config. storeId는 apiKey처럼 사용자가 DialogFlow에서 직접 지정(빈 값 유지).
function makeDocsearchConfig(overrides: { topn: string; score: string; filter: string }): any {
  return {
    topn: overrides.topn,
    input: "_llm.tool.args.query",
    score: overrides.score,
    apiKey: "",
    filter: overrides.filter,
    result: [
      { key: "context.finalResult", value: "_result", condition: "" },
      { key: "_llm.tool.result", value: "context.finalResult", condition: "" },
    ],
    storeId: "",
    endpoint: "",
    external: false,
    candidates: "",
    directInput: false,
  }
}

// llmchat 서브(body) 골격을 레퍼런스 구조대로 생성해 노드 배열로 반환한다.
// [① node(ask_docs) → set(답변 reset) → subflow 정보찾기(2패스 docquery)]
// [② set(LLM reset: _llm.terminate) → output(no_answer 안내)]
function makeLlmBodyNodes(llmId: string): { bodyIds: string[]; nodes: any[] } {
  const id = (suffix: string) => `${llmId}_${suffix}`
  const DOCSEARCH_NOTE = "docStore(storeId)는 사용자가 DialogFlow에서 직접 지정합니다."
  const nodes = [
    {
      id: id("ask"), type: "node", label: "문서 검색 처리", body: [], then: [id("ask_reset")], actions: [],
      condition: '_llm.tool.name == "ask_docs"', config: { auth: false },
    },
    {
      id: id("ask_reset"), type: "set", label: "답변 reset", body: [], then: [id("find")], actions: [], condition: "",
      config: {
        items: [
          { key: "context.finalResult", value: "[]", condition: "" },
          { key: "", value: '_debug("_llm.tool.args.query : " + _llm.tool.args.query)', condition: "" },
        ],
      },
    },
    {
      id: id("find"), type: "subflow", label: "정보찾기", body: [id("pass1"), id("pass2")], then: [], actions: [],
      condition: "", config: { loop: { count: "2", condition: "!_.isEmpty(context.finalResult)" } },
    },
    {
      id: id("pass1"), type: "node", label: "query", body: [], then: [id("search1")], actions: [],
      condition: "_loopCount == 0", config: { auth: false },
    },
    {
      id: id("search1"), type: "docquery", label: "문서 검색(질의)", body: [], then: [], actions: [], condition: "",
      config: makeDocsearchConfig({ topn: "5", score: "0.5", filter: "" }),
      description: DOCSEARCH_NOTE,
    },
    {
      id: id("pass2"), type: "node", label: "content", body: [], then: [id("search2")], actions: [],
      condition: "_loopCount > 0", config: { auth: false },
    },
    {
      id: id("search2"), type: "docquery", label: "문서 검색(본문 필터)", body: [], then: [], actions: [], condition: "",
      config: makeDocsearchConfig({ topn: "", score: "", filter: '{    "content": _llm.tool.args.query}' }),
      description: DOCSEARCH_NOTE,
    },
    {
      id: id("reset"), type: "set", label: "LLM reset", body: [], then: [id("no_answer")], actions: [], condition: "",
      config: {
        items: [
          { key: "_llm.terminate", value: "true", condition: "" },
          { key: "context.finalResult", value: "[]", condition: "" },
        ],
      },
    },
    {
      id: id("no_answer"), type: "output", label: "no_answer", body: [], then: [], actions: [],
      condition: '_llm.tool.name == "no_answer"',
      config: {
        items: [
          {
            data: "",
            type: "text",
            text: [{ texts: ["문의하신 내용을 문서에서 찾지 못했어요.\n다른 질문을 해주시겠어요?"], condition: "" }],
            channels: [{ name: "Web", use: true }],
            condition: "",
          },
        ],
        hideInput: false,
        waitInput: false,
      },
    },
  ]
  return { bodyIds: [id("ask"), id("reset")], nodes }
}

// llmchat 노드 공통 config. apiKey·model은 사용자가 DialogFlow에서 직접 입력 — 항상 "".
// (model은 키에 따라 쓸 수 있는 값이 달라 미리 정할 수 없다 — 사용자 지시 2026-07-03.)
function makeLlmNode(id: string, label: string, prompt: string): any {
  return {
    id, type: "llmchat", label, body: [], then: [], actions: [], condition: "",
    config: { tool: "", type: "openai", model: "", apiKey: "", prompt, stream: true, history: "2" },
  }
}

export function applyLlmBlocks(
  generatedJson: any,
  usage: LlmUsage,
  ctx: LlmPromptContext,
): { injected: number; swapped: number; scenario: number; chained: number; normalized: number } {
  const out = { injected: 0, swapped: 0, scenario: 0, chained: 0, normalized: 0 }
  const dialogs: any[] = Array.isArray(generatedJson?.dialogs) ? generatedJson.dialogs : []
  const mainDialog = dialogs.find((d) => d?.id === "main") || dialogs[1]
  // 노드별 지식소스 — 주입/치환 시 기록하고 정규화에서 참조. 미기록(잔존) llmchat은 general(도구 미부착이 안전).
  const sourceByNode = new Map<string, KnowledgeSource>()
  // 시나리오 전담 llmchat의 시나리오 이름 — 정규화에서 prompt를 시나리오 특화로 채울 때 사용.
  const scenarioNameByNode = new Map<string, string>()
  const promptFor = (source: KnowledgeSource, scenarioName?: string) =>
    buildLlmPrompt({ ...ctx, source, ...(scenarioName ? { scenarioName } : {}) })
  const defaultPrompt = () => promptFor(usage.source || "general")

  if (mainDialog && Array.isArray(mainDialog.nodes)) {
    const nodes: any[] = mainDialog.nodes

    // 1) 시나리오 주입(하이브리드) — 메뉴 판정보다 먼저 돌려 시나리오 소속 llmchat을 식별해 둔다.
    //    "AI 자유응답 사용=예" 시나리오는 흐름 끝에 Q&A llmchat을 보장: designFlow이 이미 배치했으면(규칙 지시)
    //    소스별 정규화만, 없으면 마지막 잎 output 뒤에 주입(샘플 봇 패턴).
    const scenarioLlmIds = new Set<string>()
    let scnIdx = 0
    for (const scn of (ctx.scenarios || [])) {
      scnIdx++
      if (!scn.llmUse) continue
      const src: KnowledgeSource = scn.llmSource || "general"
      const byId = new Map(nodes.map((n: any) => [n.id, n]))
      // 시나리오 루트: main 루트 중 condition에 진입 발화(줄 단위)가 포함되거나 label에 시나리오 이름 포함.
      const triggerLines = String(scn.trigger || "").split("\n").map((t) => t.trim()).filter(Boolean)
      const roots: string[] = Array.isArray(mainDialog.then) ? mainDialog.then : []
      let root = roots.map((id) => byId.get(id)).filter(Boolean).find((n: any) =>
        n.type !== "greeting" && n.type !== "fallback" && (
          triggerLines.some((t) => String(n.condition || "").includes(t)) ||
          (scn.name && String(n.label || "").includes(scn.name))
        ))
      // 결정론 보장: designFlow이 시나리오 루트 자체를 누락해도(설계 편차 — 2026-07-03 최종 검증에서
      // 시나리오 7개 중 1개 누락 관측) 진입 노드를 만들어 LLM 시나리오 규격을 항상 보장한다.
      if (!root) {
        const trig = (triggerLines[0] || scn.name).replace(/'/g, "\\'")
        root = {
          id: `llm_scn${scnIdx}_entry`, type: "node", label: `${scn.name} 진입`, body: [], then: [],
          actions: [], condition: `input.text.includes('${trig}')`, config: { auth: false },
        }
        nodes.push(root)
        const then: string[] = Array.isArray(mainDialog.then) ? mainDialog.then : (mainDialog.then = [])
        const aeIdx = then.indexOf("fallback")
        if (aeIdx >= 0) then.splice(aeIdx, 0, root.id)
        else then.push(root.id)
      }
      // 서브트리(then·body, DFS 선주문 — 흐름 순서 보존) 수집.
      const sub: any[] = []
      const seen = new Set<string>()
      const visit = (id: string) => {
        if (seen.has(id)) return
        seen.add(id)
        const n = byId.get(id)
        if (!n) return
        sub.push(n)
        for (const c of (n.then || [])) visit(c)
        for (const b of (n.body || [])) visit(b)
      }
      visit(root.id)

      // 수집형 LLM 시나리오(항목 ≥1) — 새 규격: 서브트리를 LLM-플로우 체인으로 교체(진입 노드만 유지).
      // 항목마다 [기본 응답 output → 수집 판정 llmchat] 쌍, tool 분기(save_{변수명})로 저장·다음 단계.
      // 원본의 api/esd 노드는 보존해 체인 끝(완료 앞)에 재배선(파라미터 바인딩 local.{변수명} 호환).
      const items = scn.items || []
      const alreadySeeded = Boolean(ctx.seededScenarioNames?.has(scn.name))
      if (items.length > 0 && !alreadySeeded && !scn.hasSubflow) {
        const preserved = sub.filter((n: any) => n !== root && (n.type === "api" || n.type === "esd"))
        const preservedIds = new Set(preserved.map((n: any) => n.id))
        const dropIds = new Set(sub.filter((n: any) => n !== root && !preservedIds.has(n.id)).map((n: any) => n.id))
        for (let i = nodes.length - 1; i >= 0; i--) if (dropIds.has(nodes[i].id)) nodes.splice(i, 1)

        const { entryId, nodes: chainNodes } = buildLlmFlowChain(items, {
          botName: ctx.botName || "", tone: ctx.tone || "", scenarioName: scn.name,
          result: scn.result, prefix: `llmflow${scnIdx}`,
        })
        nodes.push(...chainNodes)
        root.then = [entryId]
        for (const n of chainNodes) if (n.type === "llmchat") scenarioLlmIds.add(n.id)

        if (preserved.length > 0) {
          const doneId = `llmflow${scnIdx}_done`
          const lastLlm = [...chainNodes].reverse().find((n: any) => n.type === "llmchat")
          if (lastLlm) lastLlm.then = [preserved[0].id]
          for (let i = 0; i < preserved.length; i++) {
            preserved[i].then = [i + 1 < preserved.length ? preserved[i + 1].id : doneId]
          }
        }
        out.chained++
        continue
      }

      const existing = sub.find((n: any) => n.type === "llmchat")
      if (existing) {
        sourceByNode.set(existing.id, src)
        scenarioNameByNode.set(existing.id, scn.name)
        scenarioLlmIds.add(existing.id)
        continue
      }
      // 마지막 잎 output(보통 완료 멘트) 뒤에 연결 — 트리 단일부모 불변식 유지(한 잎에만).
      const leaves = sub.filter((n: any) => n.type === "output" && (!Array.isArray(n.then) || n.then.length === 0))
      const leaf = leaves[leaves.length - 1] || root
      const node = makeLlmNode(`llm_scn${scnIdx}`, `${scn.name} Q&A`, promptFor(src, scn.name))
      sourceByNode.set(node.id, src)
      scenarioNameByNode.set(node.id, scn.name)
      scenarioLlmIds.add(node.id)
      nodes.push(node)
      leaf.then = [...(leaf.then || []), node.id]
      out.scenario++
    }

    // 2) 메뉴형 보장: "시나리오 소속이 아닌" llmchat이 없으면 fallback 앞 루트로 주입.
    //    (과거의 "llmchat이 하나라도 있으면 스킵" 가드는 시나리오별 LLM 도입 후 메뉴 주입을 삼키는
    //     버그가 됨 — 2026-07-03 최종 검증에서 발견. designFlow이 만든 비시나리오 llmchat이 있으면
    //     그것을 메뉴로 보고 전역 소스로 채택한다.)
    if (usage.menu) {
      const existingMenu = nodes.find((n) => n?.type === "llmchat" && !scenarioLlmIds.has(n.id))
      if (existingMenu) {
        sourceByNode.set(existingMenu.id, usage.source || "general")
      } else {
        const node = makeLlmNode("llm_menu", "AI 상담", defaultPrompt())
        sourceByNode.set(node.id, usage.source || "general")
        nodes.push(node)
        const then: string[] = Array.isArray(mainDialog.then) ? mainDialog.then : (mainDialog.then = [])
        const aeIdx = then.indexOf("fallback")
        if (aeIdx >= 0) then.splice(aeIdx, 0, node.id)
        else then.push(node.id)
        out.injected++
      }
    }

    // 3) 폴백형 치환: fallback의 안내 output 자식 → llmchat. 구조가 예상과 다르면 생략(비차단).
    // fallback가 여러 개일 수 있다(designFlow이 자체 설계한 빈 노드 + 보일러플레이트) —
    // output 자식을 실제로 가진 노드(=보일러플레이트 서브트리)를 골라 치환한다.
    if (usage.fallback) {
      const outChildOf = (n: any) => (n?.then || []).find((id: string) =>
        nodes.some((m) => m.id === id && m.type === "output"))
      const ae = nodes.filter((n) => n?.type === "fallback").find(outChildOf)
      const outId = ae && outChildOf(ae)
      if (ae && outId) {
        const node = makeLlmNode("llm_fallback", "AI 자유응답", defaultPrompt())
        sourceByNode.set(node.id, usage.source || "general")
        ae.then = ae.then.map((id: string) => (id === outId ? node.id : id))
        nodes.splice(nodes.findIndex((n) => n.id === outId), 1)
        nodes.push(node)
        out.swapped++
      }
    }
  }

  // 3) 정규화 — 선택과 무관하게 전체 dialogs의 모든 llmchat에 항상 적용.
  for (const dialog of dialogs) {
    const dialogNodes: any[] = Array.isArray(dialog?.nodes) ? dialog.nodes : []
    for (const n of [...dialogNodes]) {
      if (n?.type !== "llmchat") continue
      const c = (n.config = n.config || {})
      c.apiKey = "" // 무조건 강제(안전 불변식)
      c.model = "" // 모델은 키에 따라 다르므로 미리 정하지 않는다 — apiKey처럼 사용자가 DialogFlow에서 입력
      if (!c.type) c.type = "openai"
      if (typeof c.tool !== "string") c.tool = ""
      if (c.stream === undefined || c.stream === null) c.stream = true
      if (!c.history) c.history = "2"
      // 노드별 지식소스(주입/치환 시 기록). 잔존 llmchat은 general — 도구를 모르는 노드에 붙이지 않는다.
      const src: KnowledgeSource = sourceByNode.get(n.id) || "general"
      if (!(typeof c.prompt === "string" && c.prompt.trim())) c.prompt = promptFor(src, scenarioNameByNode.get(n.id))
      // 런타임은 prompt를 템플릿 리터럴로 취급 — 레퍼런스 llmchat 전부 `...`로 감싸여 있다. 미감싸면 감싼다(멱등).
      const p = String(c.prompt)
      if (!(p.startsWith("`") && p.endsWith("`"))) c.prompt = "`" + p + "`"
      // 레퍼런스 골격 주입(docs/mixed만): body가 비어 있으면 [ask_docs 핸들러 → docquery 2패스] +
      // [LLM reset → no_answer]를 붙이고 도구 정의를 채운다. 이미 body/tool이 있으면(레퍼런스 학습산) 보존(멱등).
      if (src !== "general") {
        if (!(Array.isArray(n.body) && n.body.length > 0)) {
          const { bodyIds, nodes: bodyNodes } = makeLlmBodyNodes(n.id)
          n.body = bodyIds
          dialogNodes.push(...bodyNodes)
        }
        if (!c.tool.trim()) c.tool = LLM_TOOL_DEFS
      }
      out.normalized++
    }
  }
  return out
}

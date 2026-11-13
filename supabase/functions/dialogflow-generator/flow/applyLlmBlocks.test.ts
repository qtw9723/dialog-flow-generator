import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { collectLlmUsage, applyLlmBlocks, buildLlmPrompt, collectScenarioNames, collectScenarioDetails, parseKnowledgeSource } from "./applyLlmBlocks.ts"

const main = (j: any) => j.dialogs.find((d: any) => d.id === "main")
const find = (j: any, pred: (n: any) => boolean) => main(j).nodes.find(pred)
const baseJson = () => ({
  name: "테스트봇",
  dialogs: [
    { id: "predialog", name: "Pre Dialog", nodes: [] },
    {
      id: "main", name: "Main Dialog", then: ["n1", "fallback"],
      nodes: [
        { id: "n1", type: "output", label: "환영", then: [], config: { items: [] } },
        { id: "fallback", type: "fallback", label: "Fallback", body: [], then: ["fallback_out"], actions: [] },
        { id: "fallback_out", type: "output", label: "안내", then: [], config: { items: [{ type: "text", text: [{ texts: ["잘 못 알아들었어요!"] }] }] } },
      ],
    },
    { id: "postdialog", name: "Post Dialog", nodes: [] },
  ],
})
const QUESTIONS = [
  { id: "q-mode", text: "AI 자유응답(LLM) 사용 — 정해진 시나리오 외 질문을 AI가 자유롭게 답합니다", input_type: "select" },
  { id: "q-topic", text: "AI 자유응답 주제 — AI가 어떤 주제를 답하면 되나요? (선택, 한 줄)", input_type: "text" },
  { id: "q-source", text: "AI 지식소스 — AI 자유응답이 무엇을 근거로 답할까요?", input_type: "select" },
  { id: "q-name", text: "챗봇 이름을 정해주세요", input_type: "text" },
]

Deno.test("parseKnowledgeSource: 한국어 라벨 → 소스 매핑, 미지정은 general", () => {
  assertEquals(parseKnowledgeSource("문서 검색(내부 문서만)"), "docs")
  assertEquals(parseKnowledgeSource("일반 LLM 답변"), "general")
  assertEquals(parseKnowledgeSource("혼합(문서 우선 + 일반 보완)"), "mixed")
  assertEquals(parseKnowledgeSource(""), "general")
  assertEquals(parseKnowledgeSource(undefined), "general")
})

Deno.test("collectLlmUsage: 전역 'AI 지식소스' 질문에서 usage.source 수집(없으면 general)", () => {
  const withSource = collectLlmUsage({ "q-mode": "둘 다", "q-source": "문서 검색(내부 문서만)" }, QUESTIONS)
  assertEquals(withSource.source, "docs")
  const noSource = collectLlmUsage({ "q-mode": "둘 다" }, QUESTIONS)
  assertEquals(noSource.source, "general")
})

Deno.test("collectScenarioDetails: 'AI 자유응답 사용'·'AI 지식소스' 필드 파싱", () => {
  const responses = {
    "q2": [
      {
        "시나리오 이름": "보험 FAQ", "진입 발화": "보험 문의",
        "AI 자유응답 사용": "예", "AI 지식소스": "혼합(문서 우선 + 일반 보완)",
      },
      { "시나리오 이름": "상담 예약", "진입 발화": "예약" },
    ],
  }
  const [faq, resv] = collectScenarioDetails(responses)
  assertEquals(faq.llmUse, true)
  assertEquals(faq.llmSource, "mixed")
  assertEquals(resv.llmUse, false)
  assertEquals(resv.llmSource, "general")
})

Deno.test("collectLlmUsage: 모드 매핑(안 함/메뉴/폴백/둘 다)과 주제 수집", () => {
  assertEquals(collectLlmUsage({}, QUESTIONS), { menu: false, fallback: false, topic: "", source: "general" })
  assertEquals(collectLlmUsage({ "q-mode": "사용 안 함" }, QUESTIONS).menu, false)
  const m = collectLlmUsage({ "q-mode": "메뉴 항목으로 추가", "q-topic": "보험 상품 안내" }, QUESTIONS)
  assertEquals(m, { menu: true, fallback: false, topic: "보험 상품 안내", source: "general" })
  const f = collectLlmUsage({ "q-mode": "기타 질문 응대(폴백)" }, QUESTIONS)
  assertEquals(f.menu, false)
  assertEquals(f.fallback, true)
  const b = collectLlmUsage({ "q-mode": "둘 다" }, QUESTIONS)
  assertEquals(b.menu, true)
  assertEquals(b.fallback, true)
})

Deno.test("buildLlmPrompt: 봇이름·주제·말투 반영, 주제 없으면 산업군/의도로 대체", () => {
  const p = buildLlmPrompt({ botName: "테스트봇", topic: "보험 상품", tone: "친근한 존댓말" })
  assert(p.includes("테스트봇"))
  assert(p.includes("보험 상품"))
  assert(p.includes("친근한 존댓말"))
  assert(p.includes("정중히")) // 범위 밖 안내 정형문
  const q = buildLlmPrompt({ industry: "금융", intent: "상담 봇" })
  assert(q.includes("금융"))
})

Deno.test("buildLlmPrompt: 샘플 구조(섹션) + 챗봇 정보 + 시나리오 비답습 지침", () => {
  const p = buildLlmPrompt({
    botName: "과일봇", intent: "과일가게 안내 봇", industry: "소매", tone: "밝고 캐주얼",
    topic: "", features: ["매장 예약", "주문 조회"],
  })
  // 샘플(LLM Test)의 섹션 구조를 따른다
  assert(p.includes("## 챗봇 성향"))
  assert(p.includes("## 챗봇 정보"))
  assert(p.includes("## 응답 지침"))
  // 챗봇 정보(소개·산업군·제공 기능)를 나열해 답변에 활용하게 한다
  assert(p.includes("과일가게 안내 봇"))
  assert(p.includes("매장 예약"))
  assert(p.includes("주문 조회"))
  // 완전 다른 시나리오 질문이면 기존 시나리오를 답습하지 않는다는 지침
  assert(p.includes("답습"))
})

Deno.test("collectScenarioNames: 응답에서 시나리오 이름 목록 추출", () => {
  const responses = {
    "q1": "검증봇",
    "q2": [
      { "시나리오 이름": "매장 예약", "진입 발화": "예약" },
      { "시나리오 이름": "주문 조회" },
      { "진입 발화": "이름 없는 시나리오" },
    ],
  }
  assertEquals(collectScenarioNames(responses), ["매장 예약", "주문 조회"])
  assertEquals(collectScenarioNames({}), [])
})

Deno.test("collectScenarioDetails: 시나리오별 진입 발화·수집 항목·완료 결과까지 수집", () => {
  const responses = {
    "q1": "검증봇",
    "q2": [
      {
        "시나리오 이름": "상담 예약",
        "진입 발화": "상담 예약하고 싶어요",
        "수집 정보": [
          { "항목명": "이름", "필수 여부": "필수", "입력 형식": "자유텍스트", "여러 개 입력": "아니오" },
          { "항목명": "연락처", "필수 여부": "선택" },
        ],
        "완료 시 결과": "상담 예약이 완료되었습니다.",
        "외부 연동": [],
      },
      { "진입 발화": "이름 없는 시나리오" },
    ],
  }
  const details = collectScenarioDetails(responses)
  assertEquals(details.length, 1)
  assertEquals(details[0].name, "상담 예약")
  assertEquals(details[0].trigger, "상담 예약하고 싶어요")
  assertEquals(details[0].collects, ["이름(필수)", "연락처(선택)"])
  assertEquals(details[0].result, "상담 예약이 완료되었습니다.")
  assertEquals(collectScenarioDetails({}), [])
})

Deno.test("buildLlmPrompt: 제작한 챗봇 정보(시나리오 상세)를 프롬프트에 주입해 그걸 기반으로 답하게 한다", () => {
  const p = buildLlmPrompt({
    botName: "검증봇", intent: "보험 고객을 돕는 봇", industry: "금융", tone: "친근한 존댓말",
    topic: "보험 상품 문의",
    scenarios: [{
      name: "상담 예약", trigger: "상담 예약하고 싶어요",
      collects: ["이름(필수)"], result: "상담 예약이 완료되었습니다.",
    }],
  })
  // 시나리오 상세(진입 발화·수집·완료)가 챗봇 정보로 나열된다
  assert(p.includes("상담 예약하고 싶어요"))
  assert(p.includes("이름(필수)"))
  assert(p.includes("상담 예약이 완료되었습니다."))
  // 기능 요청은 시나리오 진입 발화로 안내하라는 지침
  assert(p.includes("진입 발화"))
})

Deno.test("buildLlmPrompt 소스 변형: docs=문서 한정, general=도구 없음, mixed=보완 지침", () => {
  const base = { botName: "봇", topic: "보험" }
  const docs = buildLlmPrompt({ ...base, source: "docs" })
  assert(docs.includes("ask_docs"))
  assert(docs.includes("근거로만"))          // 내부 정보 한정
  assert(!docs.includes("일반 지식으로 보완"))
  const general = buildLlmPrompt({ ...base, source: "general" })
  assert(!general.includes("ask_docs"))      // 도구 섹션 없음
  assert(general.includes("일반 지식"))
  const mixed = buildLlmPrompt({ ...base, source: "mixed" })
  assert(mixed.includes("ask_docs"))
  assert(mixed.includes("보완"))
})

Deno.test("buildLlmPrompt 시나리오 특화: scenarioName이 있으면 그 시나리오 주제 Q&A로 한정", () => {
  const p = buildLlmPrompt({ botName: "봇", source: "general", scenarioName: "보험 FAQ" })
  assert(p.includes("보험 FAQ"))
  assert(p.includes("후속 질문"))
})

Deno.test("소스 general: 주입 llmchat에 tool·body를 붙이지 않는다", () => {
  const j = baseJson()
  applyLlmBlocks(j, { menu: true, fallback: false, topic: "", source: "general" }, { botName: "봇" })
  const llm = find(j, (n) => n.type === "llmchat")
  assertEquals(llm.config.tool, "")
  assertEquals(llm.body, [])
})

Deno.test("소스 불명(정규화만 거치는 잔존 llmchat)은 general 취급 — tool·body 미주입", () => {
  const j = baseJson()
  main(j).nodes.push({ id: "stray2", type: "llmchat", label: "", then: [], config: { prompt: "", apiKey: "" } })
  applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "docs" }, { botName: "봇" })
  const n = find(j, (x) => x.id === "stray2")
  assertEquals(n.config.tool, "")
  assertEquals(n.body ?? [], [])
})

Deno.test("메뉴형: llmchat이 없으면 fallback 앞 루트로 주입 + prompt 템플릿", () => {
  const j = baseJson()
  const r = applyLlmBlocks(j, { menu: true, fallback: false, topic: "보험", source: "docs" }, { botName: "테스트봇", topic: "보험" })
  assertEquals(r.injected, 1)
  const node = find(j, (n) => n.type === "llmchat")
  assert(node, "llmchat 주입됨")
  assertEquals(node.config.apiKey, "")
  assertEquals(node.config.type, "openai")
  assert(node.config.prompt.includes("보험"))
  const then = main(j).then
  assert(then.indexOf(node.id) >= 0 && then.indexOf(node.id) < then.indexOf("fallback"))
})

Deno.test("메뉴형 멱등: designFlow이 이미 llmchat을 배치했으면 주입하지 않는다", () => {
  const j = baseJson()
  main(j).nodes.push({ id: "s1llm", type: "llmchat", label: "AI 상담", then: [], config: { prompt: "이미 있음", apiKey: "sk-leaked", model: "" } })
  main(j).then.splice(1, 0, "s1llm")
  const r = applyLlmBlocks(j, { menu: true, fallback: false, topic: "", source: "docs" }, { botName: "테스트봇" })
  assertEquals(r.injected, 0)
  const node = find(j, (n) => n.id === "s1llm")
  assertEquals(node.config.apiKey, "") // 정규화: 키 강제 제거
  assertEquals(node.config.model, "") // model은 항상 빈 값(사용자 입력)
  assertEquals(node.config.prompt, "`이미 있음`") // 채워진 prompt는 내용 보존 + 백틱 래핑
})

Deno.test("정규화: prompt는 백틱(`)으로 감싼다 — 런타임 템플릿 리터럴 컨벤션(레퍼런스 전례)", () => {
  const j = baseJson()
  main(j).nodes.push({ id: "p1", type: "llmchat", label: "", then: [], config: { prompt: "그냥 텍스트", apiKey: "" } })
  main(j).nodes.push({ id: "p2", type: "llmchat", label: "", then: [], config: { prompt: "`\n이미 감싸짐\n`", apiKey: "" } })
  applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "docs" }, { botName: "봇" })
  assertEquals(find(j, (n: any) => n.id === "p1").config.prompt, "`그냥 텍스트`")
  assertEquals(find(j, (n: any) => n.id === "p2").config.prompt, "`\n이미 감싸짐\n`") // 멱등
})

Deno.test("주입/치환 노드의 템플릿 prompt도 백틱으로 감싸진다", () => {
  const j = baseJson()
  applyLlmBlocks(j, { menu: true, fallback: true, topic: "보험", source: "docs" }, { botName: "봇", topic: "보험" })
  for (const n of main(j).nodes.filter((x: any) => x.type === "llmchat")) {
    assert(n.config.prompt.startsWith("`") && n.config.prompt.endsWith("`"), `${n.id} prompt 백틱`)
    assert(n.config.prompt.includes("보험"))
  }
})

Deno.test("정규화: model은 항상 비운다 — 키에 따라 다르므로 사용자가 DialogFlow에서 직접 입력(apiKey와 동일 원칙)", () => {
  const j = baseJson()
  main(j).nodes.push({ id: "m1", type: "llmchat", label: "", then: [], config: { model: "Gpt-4o", prompt: "p", apiKey: "" } })
  main(j).nodes.push({ id: "m2", type: "llmchat", label: "", then: [], config: { model: "gpt-4o-mini", prompt: "p", apiKey: "" } })
  applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "docs" }, {})
  assertEquals(find(j, (n: any) => n.id === "m1").config.model, "")
  assertEquals(find(j, (n: any) => n.id === "m2").config.model, "")
})

Deno.test("폴백형: fallback_out을 llmchat으로 치환", () => {
  const j = baseJson()
  const r = applyLlmBlocks(j, { menu: false, fallback: true, topic: "", source: "docs" }, { botName: "테스트봇", intent: "예약 봇" })
  assertEquals(r.swapped, 1)
  const ae = find(j, (n) => n.type === "fallback")
  const llm = find(j, (n) => n.type === "llmchat")
  assert(llm)
  assertEquals(ae.then, [llm.id])
  assertEquals(find(j, (n) => n.id === "fallback_out"), undefined) // 옛 안내 output 제거
  assertEquals(llm.config.apiKey, "")
})

Deno.test("둘 다: 주입 1 + 치환 1 (llmchat 2개)", () => {
  const j = baseJson()
  const r = applyLlmBlocks(j, { menu: true, fallback: true, topic: "상품 문의", source: "docs" }, { botName: "테스트봇" })
  assertEquals(r.injected, 1)
  assertEquals(r.swapped, 1)
  assertEquals(main(j).nodes.filter((n: any) => n.type === "llmchat").length, 2)
})

Deno.test("사용 안 함이어도 정규화는 실행: 흘러들어온 llmchat의 apiKey 제거", () => {
  const j = baseJson()
  main(j).nodes.push({ id: "stray", type: "llmchat", label: "", then: [], config: { apiKey: "sk-proj-REAL", prompt: "" } })
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "docs" }, { botName: "테스트봇" })
  assertEquals(r.injected, 0)
  assertEquals(r.swapped, 0)
  const n = find(j, (x) => x.id === "stray")
  assertEquals(n.config.apiKey, "")
  assert(n.config.prompt.length > 0) // 빈 prompt 템플릿 보충
})

Deno.test("폴백형: designFlow이 만든 빈 fallback가 앞에 있어도 output 자식을 가진 보일러플레이트를 치환", () => {
  const j = baseJson()
  // designFlow 산출물로 흘러온 fallback(then 비어있음)가 보일러플레이트보다 배열 앞에 위치
  main(j).nodes.unshift({ id: "n9", type: "fallback", label: "기본 응답", then: [], condition: "" })
  const r = applyLlmBlocks(j, { menu: false, fallback: true, topic: "", source: "docs" }, { botName: "테스트봇" })
  assertEquals(r.swapped, 1)
  const llm = find(j, (n) => n.type === "llmchat")
  assert(llm)
  assertEquals(find(j, (n) => n.id === "fallback").then, [llm.id])
  assertEquals(find(j, (n) => n.id === "n9").then, []) // 빈 fallback는 건드리지 않음
})

Deno.test("llmchat 레퍼런스 골격: 빈 body에 [ask_docs 핸들러 → docquery 2패스] + [LLM reset → no_answer] 주입", () => {
  const j = baseJson()
  applyLlmBlocks(j, { menu: true, fallback: false, topic: "보험", source: "docs" }, { botName: "봇", topic: "보험" })
  const llm = find(j, (n) => n.type === "llmchat")
  const byId = (id: string) => main(j).nodes.find((n: any) => n.id === id)

  // config.tool에 ask_docs·no_answer 정의
  assert(llm.config.tool.includes("ask_docs"))
  assert(llm.config.tool.includes("no_answer"))

  // body 루트 2개: 도구 핸들러 + LLM reset
  assertEquals(llm.body.length, 2)
  const [askId, resetId] = llm.body

  // ① ask_docs 핸들러: node(cond) → set(답변 reset) → subflow(정보찾기)
  const ask = byId(askId)
  assertEquals(ask.type, "node")
  assertEquals(ask.condition, '_llm.tool.name == "ask_docs"')
  const askReset = byId(ask.then[0])
  assertEquals(askReset.type, "set")
  assert(askReset.config.items.some((i: any) => i.key === "context.finalResult" && i.value === "[]"))
  const finder = byId(askReset.then[0])
  assertEquals(finder.type, "subflow")
  assertEquals(finder.config.loop, { count: "2", condition: "!_.isEmpty(context.finalResult)" })

  // 정보찾기 2패스: _loopCount==0(점수 검색) / _loopCount>0(본문 필터)
  assertEquals(finder.body.length, 2)
  const pass1 = byId(finder.body[0])
  assertEquals(pass1.condition, "_loopCount == 0")
  const ds1 = byId(pass1.then[0])
  assertEquals(ds1.type, "docquery")
  assertEquals(ds1.config.input, "_llm.tool.args.query")
  assertEquals(ds1.config.storeId, "")   // 사용자가 DialogFlow에서 직접 지정
  assert(ds1.config.result.some((r: any) => r.key === "context.finalResult"))
  assert(ds1.config.result.some((r: any) => r.key === "_llm.tool.result"))
  const pass2 = byId(finder.body[1])
  assertEquals(pass2.condition, "_loopCount > 0")
  const ds2 = byId(pass2.then[0])
  assertEquals(ds2.type, "docquery")
  assert(ds2.config.filter.includes("content"))

  // ② LLM reset: set(_llm.terminate) → output(no_answer 안내)
  const reset = byId(resetId)
  assertEquals(reset.type, "set")
  assert(reset.config.items.some((i: any) => i.key === "_llm.terminate" && i.value === "true"))
  const noAns = byId(reset.then[0])
  assertEquals(noAns.type, "output")
  assertEquals(noAns.condition, '_llm.tool.name == "no_answer"')
})

Deno.test("llmchat 골격 멱등: 이미 body가 있는 llmchat은 건드리지 않는다", () => {
  const j = baseJson()
  main(j).nodes.push({
    id: "learned", type: "llmchat", label: "", then: [], body: ["custom1"],
    config: { prompt: "p", apiKey: "", tool: "[{name: \"my_tool\"}]" },
  })
  main(j).nodes.push({ id: "custom1", type: "set", then: [], config: { items: [] } })
  applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "docs" }, {})
  const n = find(j, (x) => x.id === "learned")
  assertEquals(n.body, ["custom1"])              // body 보존
  assert(n.config.tool.includes("my_tool"))      // tool 보존
})

Deno.test("buildLlmPrompt: 문서 소스(docs/mixed)일 때만 도구 사용(ask_docs/no_answer) 지침 포함", () => {
  const p = buildLlmPrompt({ botName: "봇", topic: "보험", source: "docs" })
  assert(p.includes("ask_docs"))
  assert(p.includes("no_answer"))
  assert(p.includes("핵심")) // query는 핵심 키워드만
})

// 시나리오 서브트리 픽스처: 진입 node → 수집 output → set → 완료 output(잎)
const scenarioJson = () => {
  const j = baseJson()
  main(j).nodes.push(
    { id: "s1", type: "node", label: "보험 FAQ 진입", condition: "input.text.includes('보험 문의')", then: ["s2"], config: { auth: false } },
    { id: "s2", type: "output", label: "안내", condition: "", then: ["s3"], config: { items: [] } },
    { id: "s3", type: "set", label: "저장", condition: "", then: ["s4"], config: { items: [] } },
    { id: "s4", type: "output", label: "완료", condition: "", then: [], config: { items: [] } },
  )
  main(j).then.splice(1, 0, "s1")
  return j
}
const SCN = (over: any = {}) => ({
  name: "보험 FAQ", trigger: "보험 문의", collects: [], result: "",
  llmUse: true, llmSource: "docs" as const, ...over,
})

Deno.test("시나리오 주입: llmUse=예 시나리오의 마지막 잎 output 뒤에 소스별 llmchat 주입", () => {
  const j = scenarioJson()
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN()] })
  assertEquals(r.scenario, 1)
  const llm = find(j, (n) => n.type === "llmchat")
  assert(llm, "시나리오 llmchat 주입됨")
  assertEquals(find(j, (n) => n.id === "s4").then, [llm.id])   // 완료 output 뒤에 연결
  assert(llm.config.prompt.includes("보험 FAQ"))                // 시나리오 특화 prompt
  assert(llm.config.tool.includes("ask_docs"))                  // docs 소스 → 골격
  assertEquals(llm.body.length, 2)
})

Deno.test("시나리오 주입: 소스 general이면 tool·body 없이 주입", () => {
  const j = scenarioJson()
  applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "docs" },
    { botName: "봇", scenarios: [SCN({ llmSource: "general" })] })
  const llm = find(j, (n) => n.type === "llmchat")
  assertEquals(llm.config.tool, "")
  assertEquals(llm.body, [])
  assert(llm.config.prompt.includes("보험 FAQ"))
})

Deno.test("시나리오 주입 멱등: 서브트리에 이미 llmchat이 있으면 주입하지 않고 소스별 정규화만", () => {
  const j = scenarioJson()
  main(j).nodes.push({ id: "s1llm", type: "llmchat", label: "", then: [], config: { prompt: "", apiKey: "" } })
  find(j, (n: any) => n.id === "s4").then = ["s1llm"]
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({ llmSource: "mixed" })] })
  assertEquals(r.scenario, 0)
  const llm = find(j, (n) => n.id === "s1llm")
  assert(llm.config.tool.includes("ask_docs"))   // mixed → 골격 부착
  assert(llm.config.prompt.includes("보험 FAQ")) // 시나리오 특화 prompt로 채움
})

Deno.test("메뉴형+시나리오 LLM 결합: 시나리오 llmchat이 있어도 전역 메뉴 llmchat은 별도로 주입된다", () => {
  const j = scenarioJson()
  // designFlow이 시나리오 끝에 llmchat을 이미 배치한 상황
  main(j).nodes.push({ id: "s1llm", type: "llmchat", label: "", then: [], config: { prompt: "", apiKey: "" } })
  find(j, (n: any) => n.id === "s4").then = ["s1llm"]
  const r = applyLlmBlocks(j, { menu: true, fallback: false, topic: "보험", source: "docs" },
    { botName: "봇", topic: "보험", scenarios: [SCN()] })
  assertEquals(r.injected, 1)   // 시나리오 llmchat과 별개로 메뉴 주입
  const menu = find(j, (n) => n.id === "llm_menu")
  assert(menu, "메뉴 llmchat 주입됨")
  assert(main(j).then.includes("llm_menu"))
  assert(menu.config.tool.includes("ask_docs"))   // 전역 소스 docs 적용
})

Deno.test("메뉴형 채택: designFlow이 만든 비시나리오 llmchat이 있으면 주입 대신 전역 소스로 채택", () => {
  const j = baseJson()
  main(j).nodes.push({ id: "s1menu", type: "llmchat", label: "AI 상담", then: [], config: { prompt: "", apiKey: "" } })
  main(j).then.splice(1, 0, "s1menu")
  const r = applyLlmBlocks(j, { menu: true, fallback: false, topic: "", source: "docs" }, { botName: "봇" })
  assertEquals(r.injected, 0)
  const n = find(j, (x) => x.id === "s1menu")
  assert(n.config.tool.includes("ask_docs"))   // 전역 소스(docs) 골격 채택
  assertEquals(n.body.length, 2)
})

Deno.test("collectScenarioDetails: 수집 항목 상세(items — 변수명·형식·필수·되묻는 말) 파싱", () => {
  const responses = {
    "q2": [{
      "시나리오 이름": "상담 예약", "진입 발화": "예약",
      "수집 정보": [
        { "항목명": "이름", "변수명": "name", "필수 여부": "필수", "입력 형식": "자유텍스트", "없을 때 되묻는 말": "" },
        { "항목명": "연락처", "변수명": "phone", "필수 여부": "선택", "입력 형식": "전화번호", "없을 때 되묻는 말": "연락처 부탁드려요" },
      ],
    }],
  }
  const [scn] = collectScenarioDetails(responses)
  assertEquals(scn.items?.length, 2)
  assertEquals(scn.items?.[0], { label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" })
  assertEquals(scn.items?.[1].reask, "연락처 부탁드려요")
  assertEquals(scn.items?.[1].required, false)
})

Deno.test("수집형 LLM 시나리오: 서브트리를 LLM-플로우 체인으로 교체(기존 수집 노드 제거)", () => {
  const j = scenarioJson()   // s1(진입) → s2(output) → s3(set) → s4(output 완료)
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({
      llmSource: "docs",   // 수집형은 지식소스 무관 — ask_docs 미부착 확인용
      items: [{ label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" }],
      result: "예약이 완료되었습니다.",
    })] })
  assertEquals(r.chained, 1)
  // 원본 수집 노드 제거
  for (const gone of ["s2", "s3", "s4"]) assertEquals(find(j, (n) => n.id === gone), undefined)
  // 진입 → 체인: ask output → llmchat(save_name, ask_docs 없음) → 완료 output
  const root = find(j, (n) => n.id === "s1")
  const ask = find(j, (n) => n.id === root.then[0])
  assertEquals(ask.type, "output")
  const llm = find(j, (n) => n.id === ask.then[0])
  assertEquals(llm.type, "llmchat")
  assert(llm.config.tool.includes("save_name"))
  assert(!llm.config.tool.includes("ask_docs"))
  const done = find(j, (n) => n.id === llm.then[0])
  assertEquals(done.type, "output")
  assert(JSON.stringify(done.config).includes("예약이 완료되었습니다."))
})

Deno.test("수집형 교체: 원본 서브트리의 api/esd 노드는 보존되어 체인 끝(완료 앞)에 재배선", () => {
  const j = scenarioJson()
  main(j).nodes.push({ id: "esdX", type: "esd", label: "저장", then: ["s4b"], config: { fields: [{ key: "local.name" }] } })
  main(j).nodes.push({ id: "s4b", type: "output", label: "저장후 안내", then: [], config: { items: [] } })
  find(j, (n: any) => n.id === "s3").then = ["esdX"]
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({
      items: [{ label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" }],
    })] })
  assertEquals(r.chained, 1)
  const esd = find(j, (n) => n.id === "esdX")
  assert(esd, "esd 보존")
  const llm = find(j, (n) => n.type === "llmchat")
  assertEquals(llm.then, ["esdX"])                    // 체인 마지막 llmchat → esd
  const done = find(j, (n) => n.id === esd.then[0])
  assertEquals(done.type, "output")                   // esd → 완료 output
  assertEquals(find(j, (n) => n.id === "s4b"), undefined)  // 원본 후속 output은 제거
})

Deno.test("수집형+메뉴 결합: 체인 llmchat이 있어도 전역 메뉴는 별도 주입", () => {
  const j = scenarioJson()
  const r = applyLlmBlocks(j, { menu: true, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({
      items: [{ label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" }],
    })] })
  assertEquals(r.chained, 1)
  assertEquals(r.injected, 1)
  assert(find(j, (n) => n.id === "llm_menu"))
})

// Fix I1: applyScenarioSeeds이 이미 서브트리를 레퍼런스 구조로 시드해 놓은 시나리오는, 수집형 LLM
// 체인 교체(items≥1)가 그 서브트리를 통째로 갈아엎으면 시드가 소실된다(관측성 seeded=성공 주장이 거짓이 됨).
// index.ts가 applyLlmBlocks 호출 시 시드 성공 시나리오 이름을 ctx.seededScenarioNames로 넘기면,
// 그 시나리오는 체인 교체를 스킵하고 items==0 경로(잎 뒤 Q&A llmchat append)로 처리해야 한다.
Deno.test("수집형+시드 보호: seededScenarioNames에 있으면 체인 교체 대신 서브트리 보존 + 잎 뒤 Q&A llmchat", () => {
  const j = scenarioJson()   // s1(진입) → s2(output) → s3(set) → s4(output 완료) — 시드된 것으로 취급
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({
      items: [{ label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" }],
      result: "예약이 완료되었습니다.",
    })], seededScenarioNames: new Set(["보험 FAQ"]) })
  assertEquals(r.chained, 0)   // 체인 교체 스킵
  assertEquals(r.scenario, 1)  // Q&A 경로로 처리
  // 시드된 서브트리(s1~s4) 파괴되지 않음
  for (const kept of ["s1", "s2", "s3", "s4"]) assert(find(j, (n) => n.id === kept), `${kept} 보존`)
  const llm = find(j, (n) => n.type === "llmchat")
  assert(llm, "Q&A llmchat 주입됨")
  assertEquals(find(j, (n) => n.id === "s4").then, [llm.id])   // 잎(완료 output) 뒤에 연결
})

Deno.test("수집형+시드 보호: seededScenarioNames에 없으면 기존 체인 교체 동작 무회귀", () => {
  const j = scenarioJson()
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({
      items: [{ label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" }],
    })], seededScenarioNames: new Set(["다른 시나리오"]) })
  assertEquals(r.chained, 1)
  for (const gone of ["s2", "s3", "s4"]) assertEquals(find(j, (n) => n.id === gone), undefined)
})

Deno.test("루트 부재 보장(수집형): designFlow이 시나리오를 누락해도 진입 노드를 만들어 체인을 생성한다", () => {
  const j = baseJson()   // 시나리오 노드가 전혀 없는 상태
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({
      items: [{ label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" }],
    })] })
  assertEquals(r.chained, 1)
  const entry = find(j, (n) => n.type === "node" && String(n.condition).includes("보험 문의"))
  assert(entry, "진입 노드 생성됨")
  assert(main(j).then.includes(entry.id))
  assert(main(j).then.indexOf(entry.id) < main(j).then.indexOf("fallback"))
  const ask = find(j, (n) => n.id === entry.then[0])
  assertEquals(ask.type, "output")   // 체인 연결
})

Deno.test("루트 부재 보장(Q&A형): 진입 노드 + Q&A llmchat 생성", () => {
  const j = baseJson()
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN()] })   // items 없음 → Q&A형
  assertEquals(r.scenario, 1)
  const entry = find(j, (n) => n.type === "node" && String(n.condition).includes("보험 문의"))
  assert(entry, "진입 노드 생성됨")
  const llm = find(j, (n) => n.id === entry.then[0])
  assertEquals(llm.type, "llmchat")
})

Deno.test("llmUse=아니오 시나리오는 건드리지 않는다", () => {
  const j = scenarioJson()
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "docs" },
    { botName: "봇", scenarios: [SCN({ llmUse: false })] })
  assertEquals(r.scenario, 0)
  assertEquals(find(j, (n) => n.type === "llmchat"), undefined)
  assertEquals(find(j, (n) => n.id === "s4").then, [])
})

Deno.test("fallback가 없으면(비정상) 폴백 치환은 조용히 생략", () => {
  const j = baseJson()
  main(j).nodes = main(j).nodes.filter((n: any) => n.type !== "fallback" && n.id !== "fallback_out")
  main(j).then = ["n1"]
  const r = applyLlmBlocks(j, { menu: false, fallback: true, topic: "", source: "docs" }, {})
  assertEquals(r.swapped, 0)
})

Deno.test("collectScenarioDetails: 분기 설명을 수집한다(v0.8.1 — 분류 엔티티 재료)", () => {
  const d = collectScenarioDetails({
    q: [{
      "시나리오 이름": "카드 재발급",
      "진입 발화": "재발급",
      "수집 정보": [],
      "분기": [
        { "조건 대상": "직접 입력", "직접 입력 조건": "사용자가 신용카드라고 말한 경우", "그 경우 봇의 행동": "신용카드 절차 안내" },
        { "조건 대상": "local.member", "연산자": "같음", "값": "회원", "그 경우 봇의 행동": "회원가 안내" },
      ],
    }],
  })
  assertEquals(d[0].branches, [
    "사용자가 신용카드라고 말한 경우 → 신용카드 절차 안내",
    "local.member 같음 회원 → 회원가 안내",
  ])
})

Deno.test("collectScenarioDetails: 분기가 없으면 키를 만들지 않는다(기존 소비처 무영향)", () => {
  const d = collectScenarioDetails({ q: [{ "시나리오 이름": "x", "진입 발화": "y", "수집 정보": [], "분기": [] }] })
  assertEquals(d[0].branches, undefined)
})

// 2026-10-26 갈래 하위 흐름: 수집형 LLM 체인은 항목을 평평하게 잇는다 — 갈래마다 다른 단계를 가진 시나리오에
// 적용하면 갈래 구조가 사라진다(갈래 전용 항목도 무조건 수집). 이런 시나리오는 체인 교체를 건너뛰고 설계 트리를 보존한다.
Deno.test("수집형+갈래 하위 흐름: hasSubflow면 체인 교체 대신 서브트리 보존", () => {
  const j = scenarioJson()
  const r = applyLlmBlocks(j, { menu: false, fallback: false, topic: "", source: "general" },
    { botName: "봇", scenarios: [SCN({
      items: [{ label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" }],
      hasSubflow: true,
    })] })
  assertEquals(r.chained, 0)
  for (const kept of ["s1", "s2", "s3", "s4"]) assert(find(j, (n) => n.id === kept), `${kept} 보존`)
})

Deno.test("collectScenarioDetails: 갈래에 단계가 있으면 hasSubflow(중첩 포함), 없으면 false", () => {
  const sub = { 유형: "분기", 갈래: [{ "직접 입력 조건": "a", 단계: [{ 유형: "안내", 내용: "x" }] }] }
  const flat = { 유형: "분기", 갈래: [{ "직접 입력 조건": "a", "그 경우 봇의 행동": "y" }] }
  const [a, b, c] = collectScenarioDetails({ q: [
    { "시나리오 이름": "A", 단계: [sub] },
    { "시나리오 이름": "B", 단계: [flat] },
    { "시나리오 이름": "C" },
  ] })
  assertEquals(a.hasSubflow, true)
  assertEquals(b.hasSubflow, false)
  assertEquals(c.hasSubflow, false)
})

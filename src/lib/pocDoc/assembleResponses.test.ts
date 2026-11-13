import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { assembleResponses } from "./assembleResponses.ts"

// ─── 공통 fixture ────────────────────────────────────────────────────────────

const QUESTIONS = [
  { id: "q-name", text: "챗봇 이름을 정해주세요", question_role: "intent" },
  { id: "q-scenarios", text: "시나리오 입력", question_role: "required_context" },
]

const DELIVERY_BOT_EXTRACTED = {
  botName: "배송봇",
  scenarios: [
    {
      name: "배송조회",
      trigger: "배송 어디쯤이야",
      collect: ["송장번호"],
      done: "조회 결과를 안내합니다",
    },
  ],
}

// ─── AC1: spec fixture(배송봇) → questionId 키 + 템플릿 필드 매핑 ────────────

Deno.test("AC1: 배송봇 fixture → questionId 키, 시나리오 필드 정확 매핑", () => {
  const r = assembleResponses(DELIVERY_BOT_EXTRACTED, QUESTIONS)

  // questionId가 키여야 한다
  assert("q-name" in r, "q-name key missing")
  assert("q-scenarios" in r, "q-scenarios key missing")

  // 봇 이름
  assertEquals(r["q-name"], "배송봇")

  // 시나리오 배열
  const scenarios = r["q-scenarios"] as Record<string, unknown>[]
  assertEquals(Array.isArray(scenarios), true)
  assertEquals(scenarios.length, 1)

  const s = scenarios[0]
  assertEquals(s["시나리오 이름"], "배송조회")
  assertEquals(s["진입 발화"], "배송 어디쯤이야")
  assertEquals(s["수집 정보"], [{ "항목명": "송장번호" }])
  assertEquals(s["완료 시 결과"], "조회 결과를 안내합니다")
})

// ─── AC2: groupResponsesByRole + hasScenarios 호환 ──────────────────────────

Deno.test("AC2: array-of-object → hasScenarios 감지(서버 로직과 호환)", () => {
  const r = assembleResponses(DELIVERY_BOT_EXTRACTED, QUESTIONS)

  // 서버의 hasScenarios 조건: Array.isArray(v) && v.length > 0 && typeof v[0] === 'object'
  const hasScenarios = Object.values(r).some(
    (v) => Array.isArray(v) && (v as unknown[]).length > 0 && typeof (v as unknown[])[0] === "object",
  )
  assertEquals(hasScenarios, true)
})

Deno.test("AC2: groupResponsesByRole 호환 — required_context에 시나리오, intent에 봇 이름", () => {
  const r = assembleResponses(DELIVERY_BOT_EXTRACTED, QUESTIONS)

  // 서버의 groupResponsesByRole 로직을 인라인 재현
  const roleGroups: Record<string, Record<string, unknown>> = {
    required_context: {},
    intent: {},
  }
  for (const q of QUESTIONS) {
    const role = q.question_role || "required_context"
    if (r[q.id] !== undefined) {
      roleGroups[role][q.text] = r[q.id]
    }
  }

  // 봇 이름이 intent 그룹에 들어간다
  assertEquals(typeof roleGroups.intent["챗봇 이름을 정해주세요"], "string")
  assertEquals(roleGroups.intent["챗봇 이름을 정해주세요"], "배송봇")

  // 시나리오가 required_context 그룹에 array-of-object로 들어간다
  const scenarios = roleGroups.required_context["시나리오 입력"] as Record<string, unknown>[]
  assert(Array.isArray(scenarios), "시나리오가 배열이어야 함")
  assertEquals(typeof scenarios[0], "object")
})

// ─── AC3: 빈/불완전 입력 → 빈값 유지, 날조 없음, 예외 없음 ─────────────────

Deno.test("AC3: 빈 scenarios → 빈 배열, 크래시 없음", () => {
  const r = assembleResponses({ scenarios: [] }, QUESTIONS)
  assertEquals(r["q-scenarios"], [])
  // hasScenarios는 false여야 한다 (빈 배열이므로)
  const hasScenarios = Object.values(r).some(
    (v) => Array.isArray(v) && (v as unknown[]).length > 0 && typeof (v as unknown[])[0] === "object",
  )
  assertEquals(hasScenarios, false)
})

Deno.test("AC3: botName 누락 → q-name 미설정", () => {
  const r = assembleResponses({ scenarios: [] }, QUESTIONS)
  assert(!("q-name" in r), "botName 없을 때 q-name이 설정되면 안 됨")
})

Deno.test("AC3: collect 누락/undefined → 수집 정보 빈 배열", () => {
  const r = assembleResponses(
    {
      scenarios: [
        { name: "테스트", trigger: "안녕", collect: undefined as unknown as string[], done: "" },
      ],
    },
    QUESTIONS,
  )
  const scenarios = r["q-scenarios"] as Record<string, unknown>[]
  assertEquals(scenarios[0]["수집 정보"], [])
})

Deno.test("AC3: name/trigger/done 누락 → 빈 문자열 유지(날조 없음)", () => {
  const r = assembleResponses(
    {
      scenarios: [{ collect: ["항목"] } as never],
    },
    QUESTIONS,
  )
  const s = (r["q-scenarios"] as Record<string, unknown>[])[0]
  assertEquals(s["시나리오 이름"], "")
  assertEquals(s["진입 발화"], "")
  assertEquals(s["완료 시 결과"], "")
})

// ─── AC4: questions/template에 없는 키 → 무시, 크래시 없음 ──────────────────

Deno.test("AC4: extracted 미지 키 무시 — 크래시 없음", () => {
  const r = assembleResponses(
    { scenarios: [], unknownKey: "value" } as never,
    QUESTIONS,
  )
  assert(!("unknownKey" in r))
})

Deno.test("AC4: questions에 없는 역할 문항 → 해당 값 미설정, 크래시 없음", () => {
  const sparseQuestions = [
    { id: "q-name", text: "챗봇 이름을 정해주세요", question_role: "intent" },
    // 시나리오 문항 없음
  ]
  const r = assembleResponses(DELIVERY_BOT_EXTRACTED, sparseQuestions)
  // 봇 이름은 매핑되고
  assertEquals(r["q-name"], "배송봇")
  // 시나리오 키는 없어야 함 (해당 문항 없으니)
  assert(!("q-scenarios" in r))
})

Deno.test("AC4: template 인수 없어도 정상 동작", () => {
  const r = assembleResponses(DELIVERY_BOT_EXTRACTED, QUESTIONS, undefined)
  assertEquals(r["q-name"], "배송봇")
  assert(Array.isArray(r["q-scenarios"]))
})

// ─── 추가: 분기·외부 연동 있으면 포함, 없으면 누락 ──────────────────────────

Deno.test("branches/integrations 있으면 분기·외부 연동 포함", () => {
  const r = assembleResponses(
    {
      scenarios: [
        {
          name: "예약",
          trigger: "예약",
          collect: [],
          done: "완료",
          branches: [{ cond: "회원", action: "예약 진행" }],
          integrations: [{ purpose: "회원 조회" }],
        },
      ],
    },
    QUESTIONS,
  )
  const s = (r["q-scenarios"] as Record<string, unknown>[])[0]
  assert(Array.isArray(s["분기"]))
  assert(Array.isArray(s["외부 연동"]))
})

Deno.test("branches/integrations 빈 배열이면 분기·외부 연동 키 없음", () => {
  const r = assembleResponses(
    {
      scenarios: [
        { name: "예약", trigger: "예약", collect: [], done: "완료", branches: [], integrations: [] },
      ],
    },
    QUESTIONS,
  )
  const s = (r["q-scenarios"] as Record<string, unknown>[])[0]
  assert(!("분기" in s))
  assert(!("외부 연동" in s))
})

// ─── 추가: "시나리오" 텍스트 없는 required_context 폴백 ───────────────────

Deno.test("시나리오 텍스트 없는 required_context → 폴백 매핑", () => {
  const altQuestions = [
    { id: "q-name", text: "챗봇 이름을 정해주세요", question_role: "intent" },
    { id: "q-ctx", text: "맥락 입력", question_role: "required_context" },
  ]
  const r = assembleResponses(DELIVERY_BOT_EXTRACTED, altQuestions)
  assert(Array.isArray(r["q-ctx"]), "폴백 required_context에 시나리오가 들어가야 함")
})

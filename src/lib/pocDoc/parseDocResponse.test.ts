import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { normalizeExtracted, buildExtractionPrompt } from "./parseDocResponse.ts"
import { assembleResponses } from "./assembleResponses.ts"
import type { Extracted } from "./assembleResponses.ts"

// ─── AC1: 정상 JSON 응답 → Extracted 구조로 정규화 ──────────────────────────

Deno.test("AC1: 정상 JSON 응답 → 봇 이름·성격·시나리오 정규화됨", () => {
  const raw = JSON.stringify({
    botName: "배송봇",
    personality: "친절한 어조",
    scenarios: [
      {
        name: "배송조회",
        trigger: "배송 어디쯤이야",
        collect: ["송장번호"],
        done: "조회 결과를 안내합니다",
      },
    ],
  })
  const result = normalizeExtracted(raw)
  assertEquals(result.botName, "배송봇")
  assertEquals(result.personality, "친절한 어조")
  assertEquals(result.scenarios.length, 1)
  assertEquals(result.scenarios[0].name, "배송조회")
  assertEquals(result.scenarios[0].trigger, "배송 어디쯤이야")
  assertEquals(result.scenarios[0].collect, ["송장번호"])
  assertEquals(result.scenarios[0].done, "조회 결과를 안내합니다")
})

Deno.test("AC1: 마크다운 코드블록으로 감싼 JSON → 정규화됨(블록 제거 처리)", () => {
  const raw = "```json\n" + JSON.stringify({ botName: "봇", scenarios: [] }) + "\n```"
  const result = normalizeExtracted(raw)
  assertEquals(result.botName, "봇")
  assertEquals(result.scenarios, [])
})

Deno.test("AC1: branches 보존 + ESD integrations 정규화(purpose 있으면 유지)", () => {
  const raw = JSON.stringify({
    scenarios: [
      {
        name: "주문",
        trigger: "주문할게요",
        collect: ["상품명"],
        done: "주문 완료",
        branches: [{ condition: "재고 없음", label: "품절 안내" }],
        integrations: [{ purpose: "주문 정보 저장", send: ["상품명"], resultName: "주문결과" }],
      },
    ],
  })
  const result = normalizeExtracted(raw)
  assertEquals(result.scenarios[0].branches?.length, 1)
  assertEquals(result.scenarios[0].integrations?.length, 1)
  assertEquals(result.scenarios[0].integrations?.[0].purpose, "주문 정보 저장")
  assertEquals(result.scenarios[0].integrations?.[0].send, ["상품명"])
  assertEquals(result.scenarios[0].integrations?.[0].resultName, "주문결과")
})

// ─── ESD 연동 자동 추출: integrations 정규화 계약 ───────────────────────────

Deno.test("ESD: integrations 항목 purpose 없으면 폐기(쓰레기 ESD 노드 방지)", () => {
  const raw = JSON.stringify({
    scenarios: [{ name: "s", integrations: [{ system: "ERP" }, { purpose: "" }, { purpose: "   " }] }],
  })
  const result = normalizeExtracted(raw)
  // 셋 다 purpose 유효값 없음 → 전부 폐기 → integrations 키 자체 없음
  assertEquals(result.scenarios[0].integrations, undefined)
})

Deno.test("ESD: integrations send 비문자열 필터, resultName 문자열만", () => {
  const raw = JSON.stringify({
    scenarios: [{
      name: "s",
      integrations: [{ purpose: "조회", send: ["a", 1, null, "b"], resultName: 42 }],
    }],
  })
  const result = normalizeExtracted(raw)
  assertEquals(result.scenarios[0].integrations?.[0].send, ["a", "b"])
  assertEquals(result.scenarios[0].integrations?.[0].resultName, undefined)
})

Deno.test("ESD: integrations 잡키 제거 — purpose/send/resultName만 유지", () => {
  const raw = JSON.stringify({
    scenarios: [{ name: "s", integrations: [{ purpose: "저장", extra: "무시", 연동방식: "API" }] }],
  })
  const result = normalizeExtracted(raw)
  const it = result.scenarios[0].integrations?.[0] as unknown as Record<string, unknown>
  assertEquals(Object.keys(it).sort(), ["purpose"])
})

Deno.test("ESD: 유효/무효 항목 혼재 → 유효 항목만 유지", () => {
  const raw = JSON.stringify({
    scenarios: [{ name: "s", integrations: [{ system: "X" }, { purpose: "배송 조회", send: ["송장번호"] }] }],
  })
  const result = normalizeExtracted(raw)
  assertEquals(result.scenarios[0].integrations?.length, 1)
  assertEquals(result.scenarios[0].integrations?.[0].purpose, "배송 조회")
})

// ─── AC1: 깨진/부분 JSON·누락 필드 → 예외 없이 안전한 빈/부분 구조 ──────────

Deno.test("AC1: 깨진 JSON → 예외 없이 빈 구조 반환(날조 없음)", () => {
  const result = normalizeExtracted("{botName: broken json")
  assertEquals(result.scenarios, [])
  assertEquals(result.botName, undefined)
})

Deno.test("AC1: 빈 문자열 → 예외 없이 빈 구조 반환", () => {
  const result = normalizeExtracted("")
  assertEquals(result.scenarios, [])
})

Deno.test("AC1: scenarios 누락 → 빈 배열(날조 없음)", () => {
  const result = normalizeExtracted(JSON.stringify({ botName: "봇" }))
  assertEquals(result.botName, "봇")
  assertEquals(result.scenarios, [])
})

Deno.test("AC1: 시나리오 필드 누락 → 해당 키 undefined(날조 없음)", () => {
  const result = normalizeExtracted(JSON.stringify({ scenarios: [{}] }))
  assertEquals(result.scenarios.length, 1)
  assertEquals(result.scenarios[0].name, undefined)
  assertEquals(result.scenarios[0].trigger, undefined)
  assertEquals(result.scenarios[0].collect, undefined)
  assertEquals(result.scenarios[0].done, undefined)
})

Deno.test("AC1: collect에 비문자열 섞여 있으면 문자열만 유지", () => {
  const result = normalizeExtracted(
    JSON.stringify({ scenarios: [{ collect: ["항목1", 42, null, "항목2"] }] }),
  )
  assertEquals(result.scenarios[0].collect, ["항목1", "항목2"])
})

Deno.test("AC1: 배열이 아닌 값(null·숫자) 입력 → 예외 없이 빈 구조", () => {
  assertEquals(normalizeExtracted("null").scenarios, [])
  assertEquals(normalizeExtracted("42").scenarios, [])
  assertEquals(normalizeExtracted("[]").scenarios, [])
})

Deno.test("AC1: botName/personality 빈 문자열이면 키 미포함(날조 없음)", () => {
  const result = normalizeExtracted(JSON.stringify({ botName: "", personality: "", scenarios: [] }))
  assertEquals(result.botName, undefined)
  assertEquals(result.personality, undefined)
})

// ─── AC1: 정규화 출력 shape이 T1 Extracted 입력 계약과 일치 ─────────────────
// T1 assembleResponses.ts의 Extracted 타입에 직접 할당해 shape 결합을 코드로 고정.

Deno.test("AC1: 정규화 출력 shape이 T1 Extracted 입력 계약과 정확히 일치", () => {
  const raw = JSON.stringify({
    botName: "봇",
    personality: "친절",
    scenarios: [
      { name: "시나리오", trigger: "발화", collect: ["항목"], done: "완료" },
    ],
  })
  // 타입 어노테이션으로 T1↔T2 결합 고정 — shape이 어긋나면 deno 타입 체크 실패
  const result: Extracted = normalizeExtracted(raw)
  assertExists(result.scenarios)
  assertEquals(typeof result.botName, "string")
  assertEquals(Array.isArray(result.scenarios), true)
  assertEquals(Array.isArray(result.scenarios[0].collect), true)
})

// ─── buildExtractionPrompt 기본 검증 ────────────────────────────────────────

Deno.test("buildExtractionPrompt: 입력 텍스트가 프롬프트에 포함됨", () => {
  const prompt = buildExtractionPrompt("배송봇 정의서 내용")
  assertEquals(prompt.includes("배송봇 정의서 내용"), true)
})

Deno.test("buildExtractionPrompt: 추출 스키마 키가 프롬프트에 명시됨", () => {
  const prompt = buildExtractionPrompt("")
  assertEquals(prompt.includes('"botName"'), true)
  assertEquals(prompt.includes('"scenarios"'), true)
  assertEquals(prompt.includes('"collect"'), true)
})

// ─── T8: 레이아웃 견고화 — 두 레이아웃 fixture → T1 계약 shape ──────────────

const T8_QUESTIONS = [
  { id: "q-name", text: "챗봇 이름을 정해주세요", question_role: "intent" },
  { id: "q-scenarios", text: "시나리오 입력", question_role: "required_context" },
]

// 레스토랑 #1. Usecase 레이아웃: 순번|시나리오|질의|응답|화면구성|ESD|API|비고
// LLM이 이 레이아웃에서 추출한 예상 JSON (fixture — LLM 호출 없음)
const RESTAURANT_LAYOUT_FIXTURE = JSON.stringify({
  botName: "마인드웨어 레스토랑 챗봇",
  scenarios: [
    {
      name: "매장예약",
      trigger: "매장 예약하겠습니다.",
      collect: ["방문 일시", "방문 인원"],
      done: "예약이 완료됩니다.",
    },
    {
      name: "메뉴보기",
      trigger: "메뉴 보여줘",
      collect: [],
      done: "메뉴를 안내드립니다.",
    },
  ],
})

// 헬스케어 Case.N 레이아웃: Step|시나리오|화면|기능|연동|API명|Request Data|Respond Data|비고
// (시나리오 정리 시트 기준: No|Group Name|Depth1|Depth2|구분|시나리오|연동|In/out|Comment|발화 예시|Intent|Entity)
// LLM이 이 레이아웃에서 추출한 예상 JSON (fixture — LLM 호출 없음)
const HEALTHCARE_LAYOUT_FIXTURE = JSON.stringify({
  botName: "헬스케어 챗봇",
  scenarios: [
    {
      name: "신규 예약",
      trigger: "진료 예약하고 싶어요",
      collect: ["진료 항목", "진료 일시", "환자 정보"],
      done: "예약이 완료됩니다.",
      branches: [{ condition: "진료 항목 선택 실패", label: "진료 항목 선택으로 복귀" }],
    },
  ],
})

Deno.test("T8 AC1: 레스토랑 레이아웃 fixture → normalizeExtracted → Extracted 정규화됨", () => {
  const extracted = normalizeExtracted(RESTAURANT_LAYOUT_FIXTURE)
  assertEquals(extracted.botName, "마인드웨어 레스토랑 챗봇")
  assertEquals(extracted.scenarios.length, 2)
  assertEquals(extracted.scenarios[0].name, "매장예약")
  assertEquals(extracted.scenarios[0].trigger, "매장 예약하겠습니다.")
  assertEquals(extracted.scenarios[0].collect, ["방문 일시", "방문 인원"])
  assertEquals(extracted.scenarios[0].done, "예약이 완료됩니다.")
  assertEquals(extracted.scenarios[1].name, "메뉴보기")
})

Deno.test("T8 AC1: 레스토랑 fixture → assembleResponses → T1 계약 shape 충족", () => {
  const extracted = normalizeExtracted(RESTAURANT_LAYOUT_FIXTURE)
  const responses = assembleResponses(extracted, T8_QUESTIONS)
  assertEquals(typeof responses["q-name"], "string")
  assertEquals(responses["q-name"], "마인드웨어 레스토랑 챗봇")
  const scenarios = responses["q-scenarios"] as Record<string, unknown>[]
  assertEquals(Array.isArray(scenarios), true)
  assertEquals(scenarios.length, 2)
  const s0 = scenarios[0]
  assertEquals(s0["시나리오 이름"], "매장예약")
  assertEquals(s0["진입 발화"], "매장 예약하겠습니다.")
  assertEquals(s0["수집 정보"], [{ "항목명": "방문 일시" }, { "항목명": "방문 인원" }])
  assertEquals(s0["완료 시 결과"], "예약이 완료됩니다.")
})

Deno.test("T8 AC1: 헬스케어 Case.N fixture → normalizeExtracted → Extracted 정규화됨", () => {
  const extracted = normalizeExtracted(HEALTHCARE_LAYOUT_FIXTURE)
  assertEquals(extracted.botName, "헬스케어 챗봇")
  assertEquals(extracted.scenarios.length, 1)
  assertEquals(extracted.scenarios[0].name, "신규 예약")
  assertEquals(extracted.scenarios[0].trigger, "진료 예약하고 싶어요")
  assertEquals(extracted.scenarios[0].collect, ["진료 항목", "진료 일시", "환자 정보"])
  assertEquals(extracted.scenarios[0].branches?.length, 1)
})

Deno.test("T8 AC1: 헬스케어 fixture → assembleResponses → T1 계약 shape 충족", () => {
  const extracted = normalizeExtracted(HEALTHCARE_LAYOUT_FIXTURE)
  const responses = assembleResponses(extracted, T8_QUESTIONS)
  assertEquals(responses["q-name"], "헬스케어 챗봇")
  const scenarios = responses["q-scenarios"] as Record<string, unknown>[]
  assertEquals(Array.isArray(scenarios), true)
  assertEquals(scenarios.length, 1)
  const s = scenarios[0]
  assertEquals(s["시나리오 이름"], "신규 예약")
  assertEquals(s["진입 발화"], "진료 예약하고 싶어요")
  assertEquals(s["수집 정보"], [
    { "항목명": "진료 항목" },
    { "항목명": "진료 일시" },
    { "항목명": "환자 정보" },
  ])
  assertEquals(s["완료 시 결과"], "예약이 완료됩니다.")
  assertEquals(Array.isArray(s["분기"]), true)
})

// ─── T8 AC2: buildExtractionPrompt 레이아웃-견고화 지시 검증 ─────────────────

// v0.12.0 term-mapping-coverage Task 4: 열 레이아웃 인식 지침은 하드코딩을 걷어내고
// 호출부가 넘기는 layoutGuide 옵션으로 이전했다(DB의 solution_rules가 단일 소스).
// 옵션 없이 부르면 더 이상 "레이아웃" 문구가 없는 것이 맞는 동작 — 옵션으로 넘겼을 때
// 그대로 들어가는지는 parseDocResponse.test.js가 검증한다.
Deno.test("T8 AC2: buildExtractionPrompt — 옵션 없이는 레이아웃 지시가 없다(호출부 옵션으로 이전됨)", () => {
  const prompt = buildExtractionPrompt("테스트 문서")
  assertEquals(prompt.includes("레이아웃"), false)
})

Deno.test("T8 AC2: buildExtractionPrompt — 날조 금지 문구 포함됨", () => {
  const prompt = buildExtractionPrompt("테스트 문서")
  assertEquals(prompt.includes("날조 금지"), true)
})

Deno.test("T8 AC2: buildExtractionPrompt — 확신 없는 빈값 처리 문구 포함됨", () => {
  const prompt = buildExtractionPrompt("테스트 문서")
  assertEquals(prompt.includes("확신 없"), true)
})

// ─── 개선: collect는 기술 식별자보다 사용자 친화 한글 라벨 우선 ──────────────
// 헬스케어 xlsx(API 스펙 중심) 실검증에서 collect가 fname·DOB 같은 API 필드명으로
// 나오던 문제 → 프롬프트에 한글 사용자 라벨 우선 지침 추가(라이브 검증 2026-07-28).

Deno.test("개선: buildExtractionPrompt — collect 한글 사용자 라벨 우선 지침 포함됨", () => {
  const prompt = buildExtractionPrompt("테스트 문서")
  assertEquals(prompt.includes("사용자 라벨"), true)
  // API 필드 코드가 아니라 사용자에게 묻는 라벨을 쓰라는 지시가 있어야 함
  assertEquals(prompt.includes("API 필드 코드가 아니라"), true)
})

// ─── ESD 연동 인식 지침 프롬프트 포함 검증 ──────────────────────────────────

Deno.test("ESD: buildExtractionPrompt — ESD 연동 인식 지침 포함됨", () => {
  const prompt = buildExtractionPrompt("테스트 문서")
  assertEquals(prompt.includes("ESD 연동"), true)
  assertEquals(prompt.includes("integrations"), true)
  assertEquals(prompt.includes("purpose"), true)
})

Deno.test("ESD: assembleResponses — integrations → 외부 연동(ESD) 매핑", () => {
  const extracted = normalizeExtracted(JSON.stringify({
    botName: "상담봇",
    scenarios: [{
      name: "배송 조회",
      trigger: "배송 조회",
      collect: ["송장번호"],
      integrations: [{ purpose: "배송 정보 조회", send: ["송장번호"], resultName: "배송정보" }],
    }],
  }))
  const responses = assembleResponses(extracted, T8_QUESTIONS)
  const scenarios = responses["q-scenarios"] as Record<string, unknown>[]
  const ext = scenarios[0]["외부 연동"] as Record<string, unknown>[]
  assertEquals(Array.isArray(ext), true)
  assertEquals(ext.length, 1)
  assertEquals(ext[0]["연동 방식"], "내부 데이터 저장·조회 (ESD)")
  assertEquals(ext[0]["연동 목적"], "배송 정보 조회")
  assertEquals(ext[0]["보낼 정보"], ["송장번호"])
  assertEquals(ext[0]["결과를 담을 이름"], "배송정보")
})

Deno.test("ESD: assembleResponses — integrations 없으면 외부 연동 키 미포함(하위호환)", () => {
  const extracted = normalizeExtracted(JSON.stringify({
    scenarios: [{ name: "메뉴보기", trigger: "메뉴 보여줘" }],
  }))
  const responses = assembleResponses(extracted, T8_QUESTIONS)
  const scenarios = responses["q-scenarios"] as Record<string, unknown>[]
  assertEquals("외부 연동" in scenarios[0], false)
})

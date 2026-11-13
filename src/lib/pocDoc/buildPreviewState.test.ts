import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { mapExtractedToScenarios, buildResponsesFromPreview, hasUsableScenario } from "./buildPreviewState.ts"

// ─── fixture ─────────────────────────────────────────────────────────────────

const MOCK_TEMPLATE = {
  fields: [
    { name: "시나리오 이름", type: "text" },
    { name: "진입 발화", type: "textarea" },
    { name: "수집 정보", type: "group_list" },
    { name: "완료 시 결과", type: "textarea" },
    { name: "분기", type: "group_list" },
  ],
}

// ─── mapExtractedToScenarios ──────────────────────────────────────────────────

Deno.test("mapExtractedToScenarios: 정상 추출 → 템플릿 필드 정확 매핑", () => {
  const result = mapExtractedToScenarios(
    [{ name: "배송조회", trigger: "배송 어디쯤이야", collect: ["송장번호"], done: "안내합니다" }],
    MOCK_TEMPLATE,
  )
  assertEquals(result.length, 1)
  assertEquals(result[0]["시나리오 이름"], "배송조회")
  assertEquals(result[0]["진입 발화"], "배송 어디쯤이야")
  assertEquals(result[0]["수집 정보"], [{ 항목명: "송장번호" }])
  assertEquals(result[0]["완료 시 결과"], "안내합니다")
})

Deno.test("mapExtractedToScenarios: 빈 배열 → 빈 배열, 크래시 없음", () => {
  const result = mapExtractedToScenarios([], MOCK_TEMPLATE)
  assertEquals(result, [])
})

Deno.test("mapExtractedToScenarios: template null → 기본값 유지, 크래시 없음", () => {
  const result = mapExtractedToScenarios([{ name: "테스트" }], null)
  assertEquals(result.length, 1)
  assertEquals(result[0]["시나리오 이름"], "테스트")
})

Deno.test("mapExtractedToScenarios: 부분 추출(name만) → 나머지 빈값(날조 없음)", () => {
  const result = mapExtractedToScenarios([{ name: "테스트" }], MOCK_TEMPLATE)
  assertEquals(result[0]["시나리오 이름"], "테스트")
  assertEquals(result[0]["진입 발화"], "")
  assertEquals(result[0]["수집 정보"], [])
  assertEquals(result[0]["완료 시 결과"], "")
})

Deno.test("mapExtractedToScenarios: group_list 필드 기본값 빈 배열", () => {
  const result = mapExtractedToScenarios([{}], MOCK_TEMPLATE)
  assertEquals(Array.isArray(result[0]["수집 정보"]), true)
  assertEquals(Array.isArray(result[0]["분기"]), true)
})

Deno.test("mapExtractedToScenarios: collect 비문자열 포함 → 문자열만 필터", () => {
  const result = mapExtractedToScenarios(
    [{ name: "테스트", collect: ["이름", null as unknown as string, "전화번호"] }],
    MOCK_TEMPLATE,
  )
  assertEquals(result[0]["수집 정보"], [{ 항목명: "이름" }, { 항목명: "전화번호" }])
})

Deno.test("mapExtractedToScenarios: extractedScenarios null/undefined → 빈 배열", () => {
  assertEquals(mapExtractedToScenarios(null as unknown as never[], MOCK_TEMPLATE), [])
  assertEquals(mapExtractedToScenarios(undefined as unknown as never[], MOCK_TEMPLATE), [])
})

// ─── ESD 연동: integrations → 외부 연동 매핑 ──────────────────────────────────

Deno.test("mapExtractedToScenarios: integrations → 외부 연동(ESD) 매핑", () => {
  const result = mapExtractedToScenarios(
    [{
      name: "배송 조회",
      trigger: "배송 조회",
      collect: ["송장번호"],
      integrations: [{ purpose: "배송 정보 조회", send: ["송장번호"], resultName: "배송정보" }],
    }],
    MOCK_TEMPLATE,
  )
  const ext = result[0]["외부 연동"] as Record<string, unknown>[]
  assertEquals(ext.length, 1)
  assertEquals(ext[0]["연동 방식"], "내부 데이터 저장·조회 (ESD)")
  assertEquals(ext[0]["연동 목적"], "배송 정보 조회")
  assertEquals(ext[0]["보낼 정보"], ["송장번호"])
  assertEquals(ext[0]["결과를 담을 이름"], "배송정보")
})

Deno.test("mapExtractedToScenarios: integrations 없으면 외부 연동 빈 배열", () => {
  const result = mapExtractedToScenarios([{ name: "메뉴보기" }], MOCK_TEMPLATE)
  assertEquals(result[0]["외부 연동"], [])
})

Deno.test("mapExtractedToScenarios: resultName 없는 ESD(저장만) → 결과 이름 빈 문자열", () => {
  const result = mapExtractedToScenarios(
    [{ name: "주문 취소", integrations: [{ purpose: "주문 취소 저장", send: ["주문번호"] }] }],
    MOCK_TEMPLATE,
  )
  const ext = result[0]["외부 연동"] as Record<string, unknown>[]
  assertEquals(ext[0]["결과를 담을 이름"], "")
  assertEquals(ext[0]["보낼 정보"], ["주문번호"])
})

// ─── buildResponsesFromPreview ────────────────────────────────────────────────

Deno.test("buildResponsesFromPreview: 정상 입력 → responses 조립", () => {
  const r = buildResponsesFromPreview("q-name", "q-scenarios", "배송봇", [
    { "시나리오 이름": "배송조회" },
  ])
  assertEquals(r["q-name"], "배송봇")
  assert(Array.isArray(r["q-scenarios"]))
  assertEquals((r["q-scenarios"] as unknown[])[0], { "시나리오 이름": "배송조회" })
})

Deno.test("buildResponsesFromPreview: botName 빈 문자열 → q-name 미설정", () => {
  const r = buildResponsesFromPreview("q-name", "q-scenarios", "", [])
  assert(!("q-name" in r), "빈 botName은 responses에 포함되면 안 됨")
})

Deno.test("buildResponsesFromPreview: botName 공백만 → q-name 미설정", () => {
  const r = buildResponsesFromPreview("q-name", "q-scenarios", "   ", [])
  assert(!("q-name" in r))
})

Deno.test("buildResponsesFromPreview: botNameQId undefined → q-name 미설정", () => {
  const r = buildResponsesFromPreview(undefined, "q-scenarios", "봇이름", [])
  assert(!("q-name" in r))
  assert("q-scenarios" in r)
})

Deno.test("buildResponsesFromPreview: scenarioQId undefined → scenarios 미설정", () => {
  const r = buildResponsesFromPreview("q-name", undefined, "봇이름", [{ "시나리오 이름": "s1" }])
  assert(!("q-scenarios" in r))
  assertEquals(r["q-name"], "봇이름")
})

Deno.test("buildResponsesFromPreview: 빈 scenarios 배열 → scenarioQId에 빈 배열 설정", () => {
  const r = buildResponsesFromPreview("q-name", "q-scenarios", "봇이름", [])
  assertEquals(r["q-scenarios"], [])
})

// ─── hasUsableScenario ────────────────────────────────────────────────────────

Deno.test("hasUsableScenario: 빈 배열 → false", () => {
  assertEquals(hasUsableScenario([]), false)
})

Deno.test("hasUsableScenario: null/undefined → false", () => {
  assertEquals(hasUsableScenario(null), false)
  assertEquals(hasUsableScenario(undefined), false)
})

Deno.test("hasUsableScenario: 모든 필드 빈값(템플릿 기본값) 시나리오 → false", () => {
  const empty = mapExtractedToScenarios([{}], MOCK_TEMPLATE)
  assertEquals(hasUsableScenario(empty), false)
})

Deno.test("hasUsableScenario: 공백만/빈 배열 필드 → false", () => {
  assertEquals(
    hasUsableScenario([{ "시나리오 이름": "   ", "수집 정보": [], "분기": [] }]),
    false,
  )
})

Deno.test("hasUsableScenario: 이름만 있어도 → true", () => {
  const named = mapExtractedToScenarios([{ name: "배송조회" }], MOCK_TEMPLATE)
  assertEquals(hasUsableScenario(named), true)
})

Deno.test("hasUsableScenario: 수집 정보 항목만 있어도 → true", () => {
  assertEquals(hasUsableScenario([{ "시나리오 이름": "", "수집 정보": [{ 항목명: "이름" }] }]), true)
})

Deno.test("hasUsableScenario: 여러 시나리오 중 하나라도 내용 있으면 → true", () => {
  assertEquals(
    hasUsableScenario([
      { "시나리오 이름": "" },
      { "시나리오 이름": "환불" },
    ]),
    true,
  )
})

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { assembleResponses } from "./assembleResponses.ts"
import type { Extracted } from "./assembleResponses.ts"

// ─── nl-scenario fixture ─────────────────────────────────────────────────────
// 자연어 시나리오 입력 소스(v0.5.0)에서 LLM이 반환할 Extracted 구조의 대표 fixture.
// 사용자가 "상담봇, 배송조회+주문취소 두 시나리오"를 자연어로 입력했을 때 예상 구조.

const NL_EXTRACTED: Extracted = {
  botName: "상담봇",
  scenarios: [
    {
      name: "배송조회",
      trigger: "배송 조회",
      collect: ["송장번호"],
      done: "조회 결과 안내",
    },
    {
      name: "주문취소",
      trigger: "주문 취소",
      collect: ["주문번호"],
      done: "취소 접수 안내",
    },
  ],
}

const NL_QUESTIONS = [
  { id: "q-bot-name", text: "챗봇 이름을 정해주세요", question_role: "intent" },
  { id: "q-scenario-input", text: "시나리오를 입력해주세요", question_role: "required_context" },
]

// ─── AC2a: questionId 키, 시나리오 배열, 로드-베어링 필드 ──────────────────

Deno.test("nl-scenario AC2a: assembleResponses 결과가 questionId 키", () => {
  const r = assembleResponses(NL_EXTRACTED, NL_QUESTIONS)
  assert("q-bot-name" in r, "챗봇 이름 questionId가 키여야 함")
  assert("q-scenario-input" in r, "시나리오 questionId가 키여야 함")
})

Deno.test("nl-scenario AC2a: 챗봇 이름 questionId에 봇 이름 매핑", () => {
  const r = assembleResponses(NL_EXTRACTED, NL_QUESTIONS)
  assertEquals(r["q-bot-name"], "상담봇")
})

Deno.test("nl-scenario AC2a: required_context 시나리오 questionId 아래 배열", () => {
  const r = assembleResponses(NL_EXTRACTED, NL_QUESTIONS)
  const scenarios = r["q-scenario-input"]
  assertEquals(Array.isArray(scenarios), true)
  assertEquals((scenarios as unknown[]).length, 2)
})

Deno.test("nl-scenario AC2a: 각 시나리오 항목이 로드-베어링 키 보유", () => {
  const r = assembleResponses(NL_EXTRACTED, NL_QUESTIONS)
  const scenarios = r["q-scenario-input"] as Record<string, unknown>[]

  // 배송조회
  const s0 = scenarios[0]
  assertEquals(s0["시나리오 이름"], "배송조회")
  assertEquals(s0["진입 발화"], "배송 조회")
  assertEquals(s0["수집 정보"], [{ "항목명": "송장번호" }])
  assertEquals(s0["완료 시 결과"], "조회 결과 안내")

  // 주문취소
  const s1 = scenarios[1]
  assertEquals(s1["시나리오 이름"], "주문취소")
  assertEquals(s1["진입 발화"], "주문 취소")
  assertEquals(s1["수집 정보"], [{ "항목명": "주문번호" }])
  assertEquals(s1["완료 시 결과"], "취소 접수 안내")
})

// ─── AC2b: 불완전 Extracted → 빈 값 보존, 날조 없음 ──────────────────────

Deno.test("nl-scenario AC2b: 빈 collect → 수집 정보 빈 배열(날조 없음)", () => {
  const incompleteExtracted: Extracted = {
    botName: "상담봇",
    scenarios: [
      {
        name: "배송조회",
        trigger: "배송 조회",
        collect: [],        // 빈 collect
        done: "조회 결과 안내",
      },
    ],
  }
  const r = assembleResponses(incompleteExtracted, NL_QUESTIONS)
  const s = (r["q-scenario-input"] as Record<string, unknown>[])[0]
  assertEquals(s["수집 정보"], [], "빈 collect는 빈 배열 보존, 날조 없음")
})

Deno.test("nl-scenario AC2b: done 누락 → 완료 시 결과 빈 문자열(날조 없음)", () => {
  const incompleteExtracted: Extracted = {
    botName: "상담봇",
    scenarios: [
      {
        name: "주문취소",
        trigger: "주문 취소",
        collect: ["주문번호"],
        // done 누락
      },
    ],
  }
  const r = assembleResponses(incompleteExtracted, NL_QUESTIONS)
  const s = (r["q-scenario-input"] as Record<string, unknown>[])[0]
  assertEquals(s["완료 시 결과"], "", "done 누락 시 빈 문자열 보존, 날조 없음")
})

Deno.test("nl-scenario AC2b: collect와 done 모두 불완전 → 빈 값 보존, 임의값 없음", () => {
  const incompleteExtracted: Extracted = {
    botName: "상담봇",
    scenarios: [
      {
        name: "배송조회",
        trigger: "배송 조회",
        collect: [],
        // done 누락
      },
      {
        name: "주문취소",
        // trigger 누락
        collect: ["주문번호"],
        done: "취소 접수 안내",
      },
    ],
  }
  const r = assembleResponses(incompleteExtracted, NL_QUESTIONS)
  const scenarios = r["q-scenario-input"] as Record<string, unknown>[]

  // 첫 번째: collect 빈, done 빈
  assertEquals(scenarios[0]["수집 정보"], [])
  assertEquals(scenarios[0]["완료 시 결과"], "")

  // 두 번째: trigger 빈, 나머지 정상
  assertEquals(scenarios[1]["진입 발화"], "")
  assertEquals(scenarios[1]["수집 정보"], [{ "항목명": "주문번호" }])
  assertEquals(scenarios[1]["완료 시 결과"], "취소 접수 안내")
})

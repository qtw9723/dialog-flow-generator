import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildFlowPrompt } from "./buildFlowPrompt.ts"
import { NodeCatalogEntry } from "./types.ts"

const catalog: NodeCatalogEntry[] = [
  { type: "node", label: "컨디션", description: "분기 처리", promptInstruction: "조건 분기", isTerminal: false },
  { type: "output", label: "아웃풋", description: "응답", promptInstruction: "사용자 응답", isTerminal: true, variantTypes: ["text", "image", "carousel"] },
]

Deno.test("buildFlowPrompt: 카탈로그(type+label)·규칙·응답·금지지시 포함", () => {
  const prompt = buildFlowPrompt(
    { decision: { q1: "프리미엄" } },
    catalog,
    "규칙: output으로 끝낼 것",
  )
  assertStringIncludes(prompt, "output")             // 머신 타입
  assertStringIncludes(prompt, "아웃풋")              // label
  assertStringIncludes(prompt, "[종결 가능]")          // 종결 표시
  assertStringIncludes(prompt, "output으로 끝낼 것")   // 규칙 요약
  assertStringIncludes(prompt, "프리미엄")             // 응답
  assertStringIncludes(prompt, "item 선택지")          // variantTypes 렌더
  assertStringIncludes(prompt, "text/image/carousel") // 선택지 값
  // 필드 상세 만들지 말 것을 명시
  assertStringIncludes(prompt, "응답 해석·설계 지침")
  assertStringIncludes(prompt, "각 시나리오")
  assert(/필드.*(만들지|생성하지)/.test(prompt))
})

Deno.test("buildFlowPrompt: few-shot 예시 주입(있을 때만 섹션 출력)", () => {
  const withEx = buildFlowPrompt({ intent: { q: "봇" } }, catalog, "", '  예시 "진료 예약" (의료):\n    - output')
  assertStringIncludes(withEx, "[참고 예시 시나리오")
  assertStringIncludes(withEx, '예시 "진료 예약"')
  const noEx = buildFlowPrompt({ intent: { q: "봇" } }, catalog, "")
  assert(!/참고 예시 시나리오/.test(noEx))
})

Deno.test("buildFlowPrompt: 솔루션 규칙(DB ruleSummary)이 프롬프트에 주입된다", () => {
  // 규칙은 더 이상 하드코딩이 아니라 DB(solution_rules)에서 ruleSummary로 주입된다.
  const ruleSummary = "- 분기는 condition 필드 / stack은 흐름조작 전용: stack은 흐름 조작 전용이며 분기에 쓰지 마라."
  const prompt = buildFlowPrompt({ intent: { q: "예약봇" } }, catalog, ruleSummary)
  assertStringIncludes(prompt, "[솔루션 규칙 — 반드시 준수]")
  assertStringIncludes(prompt, "stack은 흐름 조작 전용")
})

Deno.test("buildFlowPrompt: loop 스키마·설계 규칙 포함(subflow 금지·exitVar/body)", () => {
  const prompt = buildFlowPrompt({ decision: { q1: "x" } }, catalog, "규칙")
  assertStringIncludes(prompt, '"type": "loop"')          // 출력 스키마에 loop 노드
  assertStringIncludes(prompt, '"exitVar"')               // loop 객체 필드
  assertStringIncludes(prompt, '"body"')
  assertStringIncludes(prompt, "subflow")               // subflow 쓰지 말라는 안내
  assertStringIncludes(prompt, "루프백 금지")              // next-순환 금지
})

// ── AC1: 회귀 — esdBundle 없으면 기존 출력과 바이트 동일 ──────────────
Deno.test("buildFlowPrompt: esdBundle 없으면 기존 출력과 동일(회귀 보장)", () => {
  const base = buildFlowPrompt({ intent: { q: "봇" } }, catalog, "규칙", "")
  assertEquals(base, buildFlowPrompt({ intent: { q: "봇" } }, catalog, "규칙", "", undefined))
  assertEquals(base, buildFlowPrompt({ intent: { q: "봇" } }, catalog, "규칙", "", null))
})

Deno.test("buildFlowPrompt: esdBundle 없으면 ESD 섹션 없음(examples 있어도)", () => {
  const withEx = buildFlowPrompt({ intent: { q: "봇" } }, catalog, "", "예시내용")
  const withExUndef = buildFlowPrompt({ intent: { q: "봇" } }, catalog, "", "예시내용", undefined)
  assertEquals(withEx, withExUndef)
  assert(!/세션 ESD 계약/.test(withEx))
})

// ── AC2: esdBundle 있으면 ESD 계약 섹션 포함 ─────────────────────────
Deno.test("buildFlowPrompt: esdBundle 있으면 ESD 계약 섹션 포함", () => {
  const esdBundle = {
    entities: [{
      name: "Patient",
      fields: [
        { name: "patientName", type: "string", key: false, crypt: "false" },
        { name: "phone", type: "string", key: false, crypt: "true" },
      ],
    }],
    apis: [],
  }
  const prompt = buildFlowPrompt({ intent: { q: "의료봇" } }, catalog, "규칙", "", esdBundle)
  assertStringIncludes(prompt, "[세션 ESD 계약")
  assertStringIncludes(prompt, "Patient")
  assertStringIncludes(prompt, "patientName")
  assertStringIncludes(prompt, 'crypt="true"')
  assertStringIncludes(prompt, "type=string")
})

Deno.test("buildFlowPrompt: 시나리오 진입 노드 scenarioName 태깅을 지시한다", () => {
  const prompt = buildFlowPrompt({ decision: { q1: "프리미엄" } }, catalog, "규칙: output으로 끝낼 것")
  assertStringIncludes(prompt, "scenarioName")
  assertStringIncludes(prompt, "토씨 하나 바꾸지 말고")   // verbatim 지시 — 핵심 절 고정
  assertStringIncludes(prompt, "요약·의역·재작명 금지")   // verbatim 지시 — 핵심 절 고정
})

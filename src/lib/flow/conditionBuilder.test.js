import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { availableVars, buildConditionExpr, parseCondition, SPECIAL_VARS } from "./conditionBuilder.js"

// ── availableVars ───────────────────────────────────────────────────────────

Deno.test("availableVars: 특수변수 우선 + set/api/esd 키 수집", () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'a', type: 'set', config: { items: [{ key: 'local.patientId' }, { key: 'context.done' }] } },
        { id: 'b', type: 'api', config: { result: [{ key: 'local.reservation' }] } },
        { id: 'c', type: 'output' },
      ],
    }],
  }
  const vars = availableVars(flow)
  assertEquals(vars.slice(0, 3), SPECIAL_VARS)  // 특수변수 우선
  assertEquals(vars.includes('local.patientId'), true)
  assertEquals(vars.includes('context.done'), true)
  assertEquals(vars.includes('local.reservation'), true)
})

Deno.test("availableVars: 빈/누락 flow → 특수변수만", () => {
  assertEquals(availableVars(null), SPECIAL_VARS)
  assertEquals(availableVars({}), SPECIAL_VARS)
  assertEquals(availableVars({ dialogs: [] }), SPECIAL_VARS)
})

Deno.test("availableVars: 중복 키 제거", () => {
  const flow = { dialogs: [{ nodes: [
    { config: { items: [{ key: 'local.x' }] } },
    { config: { items: [{ key: 'local.x' }] } },
  ] }] }
  assertEquals(availableVars(flow).filter(v => v === 'local.x').length, 1)
})

// ── buildConditionExpr ──────────────────────────────────────────────────────

Deno.test("buildConditionExpr: includes → .includes('값')", () => {
  assertEquals(buildConditionExpr("input.text", "includes", "취소"), "input.text.includes('취소')")
})

Deno.test("buildConditionExpr: eq/neq — 문자열은 따옴표, 숫자·불린은 그대로", () => {
  assertEquals(buildConditionExpr("local.status", "eq", "paid"), "local.status == 'paid'")
  assertEquals(buildConditionExpr("local.count", "eq", "3"), "local.count == 3")
  assertEquals(buildConditionExpr("local.ok", "eq", "true"), "local.ok == true")
  assertEquals(buildConditionExpr("local.status", "neq", "paid"), "local.status != 'paid'")
})

Deno.test("buildConditionExpr: exists/notexists/true/false — 값 불필요", () => {
  assertEquals(buildConditionExpr("_result", "exists"), "_result != null")
  assertEquals(buildConditionExpr("_result", "notexists"), "_result == null")
  assertEquals(buildConditionExpr("local.agree", "true"), "local.agree == true")
  assertEquals(buildConditionExpr("local.agree", "false"), "local.agree == false")
})

Deno.test("buildConditionExpr: subject 없음/값 필요한데 없음 → 빈 문자열(불완전)", () => {
  assertEquals(buildConditionExpr("", "includes", "x"), "")
  assertEquals(buildConditionExpr("input.text", "includes", ""), "")
  assertEquals(buildConditionExpr("local.x", "eq", ""), "")
})

// ── parseCondition (왕복) ────────────────────────────────────────────────────

Deno.test("parseCondition: 빈 문자열 → 기본 빌더 상태", () => {
  assertEquals(parseCondition(""), { subject: '', operator: 'includes', value: '' })
})

Deno.test("parseCondition: 각 패턴 인식", () => {
  assertEquals(parseCondition("input.text.includes('취소')"), { subject: 'input.text', operator: 'includes', value: '취소' })
  assertEquals(parseCondition("_result != null"), { subject: '_result', operator: 'exists', value: '' })
  assertEquals(parseCondition("_result == null"), { subject: '_result', operator: 'notexists', value: '' })
  assertEquals(parseCondition("local.ok == true"), { subject: 'local.ok', operator: 'true', value: '' })
  assertEquals(parseCondition("local.ok == false"), { subject: 'local.ok', operator: 'false', value: '' })
  assertEquals(parseCondition("local.status == 'paid'"), { subject: 'local.status', operator: 'eq', value: 'paid' })
  assertEquals(parseCondition("local.status != 'paid'"), { subject: 'local.status', operator: 'neq', value: 'paid' })
})

Deno.test("parseCondition: 인식 못 하는 복잡 식 → null(고급 모드 폴백)", () => {
  assertEquals(parseCondition("a && b || c(x)"), null)
})

Deno.test("빌더 왕복: build → parse → 동일 필드", () => {
  const cases = [
    { subject: 'input.text', operator: 'includes', value: '취소' },
    { subject: '_result', operator: 'exists', value: '' },
    { subject: 'local.status', operator: 'eq', value: 'paid' },
  ]
  for (const c of cases) {
    const expr = buildConditionExpr(c.subject, c.operator, c.value)
    assertEquals(parseCondition(expr), c)
  }
})

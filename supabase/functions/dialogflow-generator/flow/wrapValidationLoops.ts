// 검증 재시도 루프(subflow) 결정론적 래핑.
// designFlow LLM은 output(요청) → set(저장)만 설계한다. 모든 값/멘트 fill이 끝난 뒤,
// 검증 가능한 입력형식(숫자·날짜 등)을 가진 수집 항목을 subflow 루프로 감싸 "유효할 때까지 되묻기"를 만든다.
//
// subflow 의미론(실제 export JSON 역설계):
//  - body[] = 루프 본문 루트 노드 id (반복 대상)
//  - then[] = 루프 탈출 후 continuation (일반 노드의 next와 의미 다름)
//  - config.loop.condition = JS 식. truthy면 탈출(유효), falsy면 반복
//    (주의: DialogFlow 런타임은 이 조건식에서 match() 등 함수 호출을 지원하지 않는다 →
//     형식 검증은 본문의 set 노드에서 match로 평가해 boolean flag에 저장하고, 조건은 그 flag만 본다.)
//  - config.loop.count = 최대 반복 횟수(문자열 정수)
//  - _loopCount = 내장 반복 카운터 (text-레벨 condition에서 첫 요청/재요청 멘트 분기)

import { DEFAULT_LOOP_BEHAVIOR, exitCondition, LoopBehavior } from "./loopBehavior.ts"

export interface LoopRule {
  maxCount: number
  formats: Record<string, string>   // 입력형식 라벨 → 정규식 본문(슬래시 제외)
  onExhaust: string                 // 최대 초과 시 행동(설정값 보유용). 현재 코드 동작엔 미사용.
}

export interface CollectedVar {
  format: string          // 입력형식 라벨(예: "숫자")
  repromptText?: string   // 재요청 멘트(없을 때 되묻는 말). 없으면 기본 문구.
}

export type VarFormatMap = Record<string, CollectedVar>

// 규칙(solution_rules의 Loop Rule)이 없거나 파싱 실패 시 폴백 기본값.
export const DEFAULT_LOOP_RULE: LoopRule = {
  maxCount: 3,
  formats: {
    "숫자": "^[0-9-]+$",
    "날짜": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
  },
  onExhaust: "continue",
}

const DEFAULT_REPROMPT = "입력하신 형식이 올바르지 않아요. 다시 입력해주세요."

// solution_rules의 'Loop Rule' 행(content jsonb)들에서 LoopRule을 해석한다.
// 여러 행을 병합한다 — 어드민에서 행 1개 = 입력형식 1개 검증 규칙으로 관리할 수 있게.
// 행 content가 가질 수 있는 두 모양:
//  1) 설정 행: { formats: {라벨:정규식,...}, maxCount, onExhaust } — formats 전체 병합 + maxCount/onExhaust 채택
//  2) 형식 행: { format: "전화번호", regex: "^...$" }              — formats에 항목 1개 추가
// formats가 하나도 안 모이면(=행 부재/전부 형식 이상) DEFAULT_LOOP_RULE로 폴백(기능이 죽지 않음).
export function resolveLoopRule(rows: Array<{ category?: string; content?: unknown }>): LoopRule {
  const loopRows = (rows || []).filter((r) => r?.category === "Loop Rule")
  const formats: Record<string, string> = {}
  let maxCount: number | null = null
  let onExhaust: string | null = null

  for (const row of loopRows) {
    const c: any = row?.content
    if (!c || typeof c !== "object") continue
    // 설정 행: maxCount / onExhaust / formats 맵
    if (Number.isInteger(c.maxCount) && c.maxCount > 0) maxCount = c.maxCount
    if (typeof c.onExhaust === "string" && c.onExhaust.trim()) onExhaust = c.onExhaust.trim()
    if (c.formats && typeof c.formats === "object" && !Array.isArray(c.formats)) {
      for (const [label, rx] of Object.entries(c.formats)) {
        if (typeof label === "string" && label.trim() && typeof rx === "string" && rx.trim()) formats[label.trim()] = rx
      }
    }
    // 형식 행: { format, regex }
    if (typeof c.format === "string" && c.format.trim() && typeof c.regex === "string" && c.regex.trim()) {
      formats[c.format.trim()] = c.regex
    }
  }

  return {
    maxCount: maxCount ?? DEFAULT_LOOP_RULE.maxCount,
    formats: Object.keys(formats).length > 0 ? formats : DEFAULT_LOOP_RULE.formats,
    onExhaust: onExhaust ?? DEFAULT_LOOP_RULE.onExhaust,
  }
}

// 식별자 정규화: 소문자 + 영숫자/한글만. (set key 마지막 세그먼트 ↔ 시나리오 변수명/항목명 매칭용)
function normId(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
}

// 시나리오 응답에서 검증 가능한 수집 항목만 추출 → {정규화 안 한 식별자: {format, repromptText}}.
// 식별자 = 변수명(있으면) 아니면 항목명. responses의 배열값(시나리오 목록)을 훑는다.
export function buildVarFormatMap(responses: Record<string, any>, rule: LoopRule): VarFormatMap {
  const map: VarFormatMap = {}
  const validFormats = new Set(Object.keys(rule.formats || {}))
  for (const v of Object.values(responses || {})) {
    if (!Array.isArray(v) || v.length === 0 || typeof v[0] !== "object") continue
    for (const scenario of v) {
      const items = scenario?.["수집 정보"]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const format = String(item?.["입력 형식"] || "").trim()
        if (!validFormats.has(format)) continue
        const id = String(item?.["변수명"] || "").trim() || String(item?.["항목명"] || "").trim()
        if (!id) continue
        const reprompt = String(item?.["없을 때 되묻는 말"] || "").trim()
        map[id] = reprompt ? { format, repromptText: reprompt } : { format }
      }
    }
  }
  return map
}

// set 노드의 첫 'input.text' 저장 키 반환(예: "_user.phone"). 없으면 null.
function inputTextKey(setNode: any): string | null {
  const items = setNode?.config?.items
  if (!Array.isArray(items)) return null
  for (const it of items) {
    if (it && it.value === "input.text" && typeof it.key === "string" && it.key.trim()) return it.key.trim()
  }
  return null
}

// output 노드 멘트에 _loopCount 분기 2개(첫 요청 / 재요청) 주입. 멱등.
function injectRetryText(outputNode: any, repromptText?: string): void {
  const items = outputNode?.config?.items
  if (!Array.isArray(items)) return
  for (const it of items) {
    if (!it || it.type !== "text" || !Array.isArray(it.text) || it.text.length === 0) continue
    if (it.text.some((t: any) => t?.condition === "_loopCount >= 1")) continue  // 이미 주입됨
    it.text[0].condition = "_loopCount < 1"
    it.text.push({ condition: "_loopCount >= 1", texts: [repromptText || DEFAULT_REPROMPT] })
  }
}

/**
 * 검증 가능한 수집 항목(output 요청 → set 저장)을 subflow 루프로 감싼다.
 * 매칭/구조 이상이면 그 항목은 건너뛴다(기존 평면 구조 유지 — 절대 깨진 플로우 미출력).
 * @returns 감싼 항목 수
 */
export function wrapValidationLoops(
  generatedJson: any,
  varFormatMap: VarFormatMap,
  rule: LoopRule,
  behavior: LoopBehavior = DEFAULT_LOOP_BEHAVIOR,
): { wrapped: number } {
  const main = (generatedJson?.dialogs || []).find((d: any) => d?.id === "main")
  if (!main || !Array.isArray(main.nodes)) return { wrapped: 0 }
  const nodes: any[] = main.nodes

  // 정규화 식별자 → CollectedVar
  const lookup = new Map<string, CollectedVar>()
  for (const [k, val] of Object.entries(varFormatMap || {})) lookup.set(normId(k), val)
  if (lookup.size === 0) return { wrapped: 0 }

  let wrapped = 0
  // 반복 중 push로 인한 재진입 방지: 시작 시점의 set 노드만 후보로 스냅샷
  const setNodes = nodes.filter((n) => n.type === "set" && inputTextKey(n))
  for (const setNode of setNodes) {
    const key = inputTextKey(setNode)
    if (!key) continue
    const seg = key.split(".").pop() || key
    const entry = lookup.get(normId(seg))
    if (!entry) continue
    const regex = (rule.formats || {})[entry.format]
    if (!regex) continue

    // 직전 요청 output: then이 정확히 [set.id]인 output 1개여야 한다(본문 모호 방지)
    const parents = nodes.filter((n) => Array.isArray(n.then) && n.then.includes(setNode.id))
    const askOutput = parents.find((n) => n.type === "output" && n.then.length === 1 && n.then[0] === setNode.id)
    if (!askOutput) continue
    // 멱등: 이미 어떤 subflow body에 들어가 있으면 건너뜀
    if (nodes.some((n) => n.type === "subflow" && Array.isArray(n.body) && n.body.includes(askOutput.id))) continue

    const continuation = Array.isArray(setNode.then) ? [...setNode.then] : []

    // 형식 검증은 본문의 set 노드에서 match로 평가해 boolean flag에 저장한다.
    // (런타임이 loop.condition 식의 match()를 지원하지 않으므로, 루프는 다른 루프처럼 flag만 본다.)
    // flag는 context. 네임스페이스 boolean(예: context.phoneValid). value는 식으로 평가돼 boolean이 됨.
    const validVar = `context.${seg}Valid`
    const validSet = {
      id: `${setNode.id}__valid`,
      type: "set",
      label: `${askOutput.label || "입력"} 형식 검증`,
      condition: "",
      config: { items: [{ key: validVar, value: `${key}.match(/${regex}/) != null`, condition: "" }] },
      then: [],
      actions: [],
    }

    const sub = {
      id: `${setNode.id}__loop`,
      type: "subflow",
      label: `${askOutput.label || "입력"} 검증`,
      condition: "",
      config: { loop: { condition: exitCondition(validVar, behavior), count: String(rule.maxCount) } },
      body: [askOutput.id],
      then: continuation,
      actions: [],
    }

    // 재배선: askOutput.id를 가리키던 모든 then 참조 + dialog.then 루트를 subflow로 교체
    for (const n of nodes) {
      if (Array.isArray(n.then)) n.then = n.then.map((t: string) => (t === askOutput.id ? sub.id : t))
    }
    if (Array.isArray(main.then)) main.then = main.then.map((t: string) => (t === askOutput.id ? sub.id : t))
    // 저장 set → 검증 set 으로 이어 본문 체인 완성(검증 set이 본문의 잎 → 루프가 재진입 제어)
    setNode.then = [validSet.id]
    // 첫 요청/재요청 멘트 분기
    injectRetryText(askOutput, entry.repromptText)

    nodes.push(validSet)
    nodes.push(sub)
    wrapped++
  }

  return { wrapped }
}

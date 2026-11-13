// fillNodeValues: 값 채우기
// expandFlowWithSpecs가 만든 구조 스켈레톤에, 사용자 입력을 LLM이 해석해
// 각 노드의 실제 필드 값(set 변수·esd 쿼리·분기 조건·output 메시지)을 채운다.
// 실패해도 throw하지 않는다 — 생성은 항상 스켈레톤으로라도 성공한다.

import { renderEsdContract, renderConfirmedMapping } from "./esdContract.ts"
import { esdSchemaNameOf, extractResultFields, findUnknownEsdRefs, findUnusedLookups, resolveResultFields, schemaFieldsOf } from "./esdFields.ts"
import type { NlpBundle } from "../../_shared/deriveNlpData.ts"

// 값을 갖는(채울 의미가 있는) 노드 타입. greeting/group/stack 등 구조 노드는 제외.
export const FILLABLE_TYPES = new Set(["set", "esd", "api", "node", "output", "llmchat"])

interface FillPatch {
  label?: string
  condition?: string
  config?: Record<string, unknown>
}

// LLM 응답에서 JSON 객체만 관대하게 추출 (```json 펜스/잡텍스트 허용)
export function parsePatches(raw: string): Record<string, FillPatch> {
  if (!raw) return {}
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  else {
    const first = text.indexOf("{")
    const last = text.lastIndexOf("}")
    if (first >= 0 && last > first) text = text.slice(first, last + 1)
  }
  try {
    const obj = JSON.parse(text)
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {}
  } catch {
    return {}
  }
}

// 패치를 노드에 적용. 있는 필드만 덮어쓴다. 미지 nodeId는 무시. 반환=적용 노드 수.
export function applyFillPatches(generatedJson: any, patches: Record<string, FillPatch>): number {
  const nodes: any[] = (generatedJson?.dialogs || []).flatMap((d: any) => d?.nodes || [])
  const byId = new Map<string, any>(nodes.map((n) => [n.id, n]))
  let applied = 0
  for (const [id, patch] of Object.entries(patches || {})) {
    const node = byId.get(id)
    if (!node || !patch || typeof patch !== "object") continue
    let touched = false
    if (typeof patch.label === "string" && patch.label.trim()) { node.label = patch.label; touched = true }
    if (typeof patch.condition === "string") { node.condition = patch.condition; touched = true }
    if (patch.config && typeof patch.config === "object" && !Array.isArray(patch.config)) {
      node.config = { ...(node.config || {}), ...patch.config }
      touched = true
    }
    if (touched) applied++
  }
  return applied
}

interface BranchInfo { id: string; label: string; children: { id: string; label: string }[] }

// 멘트에서 참조 가능한 변수 1개. set=scalar, esd 조회/저장 결과=object(단건)/array(다건).
export interface AvailableVar {
  name: string                       // 스코프 포함 변수명 (예: local.name, local.reservation)
  kind: "scalar" | "object" | "array"
  fields?: string[]                  // object/array일 때 접근 가능한 필드명들
  note?: string                      // 출처 힌트 (esd type 등)
}

// 외부 연동(API) 응답 필드: 사용자가 '받을 정보'로 지정한 값들을 apiName별로 모은다.
// API 응답 스키마는 api_def에 없으므로(불투명 _result), 사용자가 명시한 '받을 정보'가 유일한 필드 출처다.
export function buildApiReceiveFields(responses: Record<string, any>): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const v of Object.values(responses || {})) {
    if (!Array.isArray(v)) continue
    for (const scen of v) {
      const exts = scen?.["외부 연동"]
      if (!Array.isArray(exts)) continue
      for (const ext of exts) {
        if (!String(ext?.["연동 방식"] || "").includes("API")) continue
        const name = String(ext?.["API 이름"] || "").trim()
          || (String(ext?.["사용할 API"] || "").trim() && !["새로 입력", "직접 입력"].includes(String(ext?.["사용할 API"]).trim()) ? String(ext["사용할 API"]).trim() : "")
        if (!name) continue
        const recv = ext?.["받을 정보"]
        const fields = Array.isArray(recv) ? recv.map((x) => String(x).trim()).filter(Boolean) : []
        if (fields.length) map[name] = fields
      }
    }
  }
  return map
}

// 한 노드가 '선언하는' 변수들. set→scalar, esd result→object(create/findone)/array(findall), api result(_result)→object.
function declaredVarsOf(node: any, schemaFields: Record<string, string[]>, apiFieldsByName: Record<string, string[]> = {}): AvailableVar[] {
  const out: AvailableVar[] = []
  if (!node) return out
  const cfg = node.config || {}
  if (node.type === "set") {
    for (const it of (cfg.items || [])) {
      if (it && typeof it.key === "string" && it.key) out.push({ name: it.key, kind: "scalar" })
    }
  } else if (node.type === "esd") {
    const isArray = cfg.type === "findall"
    const schema = esdSchemaNameOf(node)
    const fields = (schema && schemaFields[schema]) || []
    for (const r of (cfg.result || [])) {
      if (!r || typeof r.key !== "string" || !r.key) continue
      if (typeof r.value === "string" && r.value.includes("_result")) {
        out.push({ name: r.key, kind: isArray ? "array" : "object", fields, note: cfg.type })
      }
    }
  } else if (node.type === "api") {
    // API 결과(_result 저장)는 JSON 객체. 필드는 사용자가 '받을 정보'로 지정한 것(없으면 미상).
    const fields = (cfg.apiName && apiFieldsByName[cfg.apiName]) || []
    for (const r of (cfg.result || [])) {
      if (!r || typeof r.key !== "string" || !r.key) continue
      if (typeof r.value === "string" && r.value.includes("_result")) {
        out.push({ name: r.key, kind: "object", fields, note: "api" })
      }
    }
  }
  return out
}

// 채워진(또는 스켈레톤) 노드 전체에서 선언된 변수 카탈로그(중복 제거). 흐름 위치 무시 — 전역 목록.
export function collectVariables(
  nodes: any[],
  apiFieldsByName: Record<string, string[]> = {},
  resultFieldsBySchema: Record<string, string[]> = {},
): AvailableVar[] {
  const sf = schemaFieldsOf(nodes, resultFieldsBySchema)
  const seen = new Set<string>()
  const vars: AvailableVar[] = []
  for (const n of nodes) {
    for (const v of declaredVarsOf(n, sf, apiFieldsByName)) {
      if (!seen.has(v.name)) { seen.add(v.name); vars.push(v) }
    }
  }
  return vars
}

// 각 노드가 '도달 전(앞 흐름)에 선언된' 변수만 모은 맵: nodeId → 사용 가능 변수[].
// 규칙: 변수는 그 노드의 조상(then으로 그 노드에 도달하게 하는 선행 노드)이 선언한 것만 쓸 수 있다.
// (다른 시나리오 루트·하류 노드의 변수는 제외 → 멘트가 미선언 변수를 날조하는 것을 결정론적으로 차단.)
export function availableVarsByNode(
  nodes: any[],
  apiFieldsByName: Record<string, string[]> = {},
  resultFieldsBySchema: Record<string, string[]> = {},
): Record<string, AvailableVar[]> {
  const sf = schemaFieldsOf(nodes, resultFieldsBySchema)
  const ids = new Set(nodes.map((n) => n.id))
  // child → parents (역방향 인접)
  const parents: Record<string, string[]> = {}
  for (const n of nodes) {
    for (const c of (n.then || [])) {
      if (!ids.has(c)) continue
      ;(parents[c] = parents[c] || []).push(n.id)
    }
  }
  const declaredCache: Record<string, AvailableVar[]> = {}
  for (const n of nodes) declaredCache[n.id] = declaredVarsOf(n, sf, apiFieldsByName)

  const result: Record<string, AvailableVar[]> = {}
  for (const n of nodes) {
    // 조상 전체 수집 (역방향 BFS, 사이클 안전)
    const ancestors = new Set<string>()
    const queue = [...(parents[n.id] || [])]
    while (queue.length) {
      const a = queue.shift()!
      if (ancestors.has(a)) continue
      ancestors.add(a)
      for (const p of (parents[a] || [])) queue.push(p)
    }
    const seenVar = new Set<string>()
    const vars: AvailableVar[] = []
    for (const a of ancestors) {
      for (const v of declaredCache[a]) {
        if (!seenVar.has(v.name)) { seenVar.add(v.name); vars.push(v) }
      }
    }
    result[n.id] = vars
  }
  return result
}

// 루프 종료/제어 플래그 변수 이름 집합 (subflow의 loop.condition에서 추출).
// 이 변수들은 루프를 멈추기 위한 boolean 플래그(예: context.menuDone)일 뿐 사용자 데이터가 아니다.
// → output 멘트의 '쓸 수 있는 변수'에서 제외해, LLM이 이를 데이터처럼 노출하는 것을 결정론적으로 차단.
//   (조건식 단계에서는 이 변수가 정당히 쓰이므로 제외하지 않는다 — output 경로에서만 거른다.)
export function loopControlVars(nodes: any[]): Set<string> {
  const out = new Set<string>()
  for (const n of nodes || []) {
    const cond = n?.type === "subflow" ? n?.config?.loop?.condition : null
    if (typeof cond !== "string" || !cond) continue
    for (const m of cond.matchAll(/\b((?:context|local|global)\.[A-Za-z0-9_]+)/g)) out.add(m[1])
  }
  return out
}

// 변수 1개를 한 줄로 간단 렌더.
// 핵심: JSON(객체/배열)은 통째로 화면에 안 보인다 → 반드시 정확한 키로 개별 값을 하나하나 참조한다.
function renderVarLine(v: AvailableVar): string {
  if (v.kind === "object") {
    const src = v.note === "api" ? "API 조회 결과 JSON 객체" : "JSON 객체"
    if ((v.fields || []).length) {
      return `${v.name}(${src} — 통째로는 안 보임, 정확한 키로 개별 참조: ${v.fields!.map((f) => `\`${"$"}{${v.name}.${f}}\``).join(", ")})`
    }
    // 필드 미상: 목적에 맞는 영문 키를 추론해 키별로 쓰게 한다. 통째(${name})는 안 보이므로 금지.
    return `${v.name}(${src} — 통째로는 안 보임, 정확한 키로 개별 참조 \`${"$"}{${v.name}.키}\`. 키 미상이면 목적에 맞는 영문 키를 추론해 \`${"$"}{${v.name}.영문키}\` 처럼)`
  }
  if (v.kind === "array") {
    const fieldHint = (v.fields || []).length ? `, 항목 키: ${(v.fields || []).join("/")}` : ""
    return `${v.name}(JSON 배열${fieldHint} — 통째로는 안 보임. 원소를 정확한 키로 하나하나: \`${"$"}{${v.name}[0].키}\`, \`${"$"}{${v.name}[1].키}\` …)`
  }
  return `${v.name}(텍스트 → \`${"$"}{${v.name}}\`)`
}

// output 노드의 사용자 안내 메시지를 만드는 전담 프롬프트.
// varsByNode: 각 output이 '앞 흐름에서 선언된' 변수만 보도록 노드별 사용가능 변수 맵을 받는다.
// rules: solution_rules(DB)에서 온 output 단계 규칙 — 어드민/학습이 관리(하드코딩 아님).
export function buildOutputPrompt(
  outputNodes: any[],
  responsesByRole: Record<string, any>,
  varsByNode: Record<string, AvailableVar[]> = {},
  rules: string[] = [],
  isRetry = false,
  esdBundle?: any,
): string {
  const list = outputNodes.map((n) => {
    const vs = varsByNode[n.id] || []
    const varText = vs.length
      ? vs.map(renderVarLine).join(", ")
      : "(이 노드 앞에서 선언된 변수 없음 → 멘트에 변수를 쓰지 마라)"
    return `   - id=${n.id} : 의도="${n.label || ""}"\n       · 이 노드에서 쓸 수 있는 변수(앞 흐름에서 선언됨): ${varText}`
  }).join("\n")
  const ruleSection = rules.length ? `\n[솔루션 규칙 — 반드시 준수]\n${rules.join("\n")}\n` : ""
  const esdSection = esdBundle ? `\n${renderEsdContract(esdBundle)}\n` : ""
  return `DialogFlow 챗봇의 각 output 노드가 사용자에게 보낼 **실제 안내 문장(멘트)**을 작성하라.
의도(라벨)는 그 노드가 '할 일'을 설명한 것일 뿐 출력문이 아니다. 사용자에게 자연스럽게 말하는 문장으로 바꿔라(설명문 그대로 쓰지 마라).

[사용자 입력(맥락) — preference의 '말투'를 반드시 반영하라]
${JSON.stringify(responsesByRole, null, 2)}

[output 노드들 — 각 노드별 "쓸 수 있는 변수"가 함께 표기됨]
${list}
${ruleSection}${esdSection}
[작성 규칙]
- 의도 → 실제 멘트. 예: 의도"환영 인사와 안내"→"안녕하세요! 무엇을 도와드릴까요?", 의도"진료 예약을 시작하고 이름을 요청"→"진료 예약을 도와드릴게요. 성함을 알려주세요."
- preference(말투)를 반영(친근한 존댓말 등). 정보 요청이면 무엇을 입력하면 되는지 명확히.
- 멘트에서 값을 보여줄 땐 \`${"$"}{변수명}\` 형식을 쓰되, 각 노드의 "쓸 수 있는 변수" 목록에 있는 것만 쓴다(위 솔루션 규칙 준수).
${isRetry ? "[재시도] 직전 응답이 비었다. 모든 output 노드의 멘트를 빠짐없이 작성하라.\n" : ""}[출력 — JSON만, 다른 텍스트 금지]
{ "<output id>": { "message": "<실제 멘트>" }, ... }
- 위 모든 output 노드를 포함하라.`
}

// 멘트의 placeholder leak 정리(결정론적): ${var.필드}처럼 필드명 자리에 한글 placeholder가 남으면
// (LLM이 필드 미상일 때 '필드'·'영문필드명' 등을 그대로 출력) 그 dot 세그먼트를 떼어 ${var} 전체로 만든다.
// 변수/필드명은 영문 규칙이라 ${...} 안의 ".<한글>" 세그먼트는 실값이 아닌 placeholder로 간주(안전).
export function sanitizePlaceholders(msg: string): string {
  if (typeof msg !== "string") return msg
  return msg.replace(/\$\{([^}]*?)((?:\.[가-힣][^.}]*)+)\}/g, "${$1}")
}

// output 메시지({id:{message}})를 노드의 text 컴포넌트에 적용. 구조(channels 등)는 보존. 반환=적용 수.
export function applyOutputMessages(generatedJson: any, messages: Record<string, any>): number {
  const nodes: any[] = (generatedJson?.dialogs || []).flatMap((d: any) => d?.nodes || [])
  const byId = new Map<string, any>(nodes.map((n) => [n.id, n]))
  let applied = 0
  for (const [id, p] of Object.entries(messages || {})) {
    const node = byId.get(id)
    const raw = p && typeof (p as any).message === "string" ? (p as any).message : null
    if (!node || node.type !== "output" || !raw) continue
    const msg = sanitizePlaceholders(raw)
    const textItem = (node.config?.items || []).find((it: any) => it?.type === "text" && Array.isArray(it.text) && it.text[0])
    if (textItem) { textItem.text[0].texts = [msg]; applied++ }
  }
  return applied
}

// 분기 지점(then≥2)과 자식 목록을 계산
function computeBranches(nodes: any[], labelById: Map<string, string>): BranchInfo[] {
  return nodes
    .filter((n) => Array.isArray(n.then) && n.then.length >= 2)
    .map((n) => ({
      id: n.id,
      label: n.label || n.type,
      children: (n.then as string[]).map((cid) => ({ id: cid, label: labelById.get(cid) || cid })),
    }))
}

// 분기 자식 condition만 채우는 집중 프롬프트 (별도 호출로 신뢰성 ↑)
// rules: solution_rules(DB)에서 온 condition 단계 규칙 — 어드민/학습이 관리(하드코딩 아님).
export function buildConditionPrompt(
  roots: { id: string; label: string }[],
  branches: BranchInfo[],
  responsesByRole: Record<string, any>,
  rules: string[] = [],
  varsByNode: Record<string, AvailableVar[]> = {},
  esdBundle?: any,
  nlpBundle?: NlpBundle | null,
  intentByRootId: Record<string, string> = {},
): string {
  // 루트별 인텐트명을 아는 만큼 조건을 "판단"이 아니라 "복사"로 만든다 —
  // 이름이 한 글자만 어긋나도 봇이 진입 자체를 못 하므로 LLM 재량을 최대한 줄인다.
  const rootText = roots.length
    ? roots.map((r) => {
        const intent = String(intentByRootId[r.id] || "").trim()
        return intent
          ? `   - id=${r.id} : "${r.label}"  → condition: intent("${intent}")`
          : `   - id=${r.id} : "${r.label}"`
      }).join("\n")
    : "(없음)"
  // 각 분기 갈래에 '앞 흐름에서 선언된 실제 변수'를 함께 보여준다 →
  // 조건식이 사용자 입력의 항목명(한글 라벨)을 변수명으로 지어내지 않고 실제 변수명을 쓰게 한다.
  const branchText = branches.length
    ? branches.map((b) => `■ 분기 "${b.label}" 의 갈래들:\n${b.children.map((c) => {
        const vs = varsByNode[c.id] || []
        const varText = vs.length ? vs.map(renderVarLine).join(", ") : "(앞 흐름에서 선언된 변수 없음)"
        return `   - id=${c.id} : "${c.label}"\n       · 이 갈래에서 쓸 수 있는 변수(앞 흐름에서 선언됨): ${varText}`
      }).join("\n")}`).join("\n")
    : "(없음)"
  const ruleSection = rules.length ? `\n[솔루션 규칙 — 반드시 준수]\n${rules.join("\n")}\n` : ""
  const esdSection = esdBundle ? `\n${renderEsdContract(esdBundle)}\n` : ""
  // 번들이 없으면 섹션 자체를 만들지 않는다 — 빈 목록을 보여주면 LLM이 "없음"을 이름으로 쓴다.
  const intentNames = (nlpBundle?.intents || []).map((i) => i.name).filter(Boolean)
  const entityPairs = (nlpBundle?.entities || []).flatMap((e) =>
    (e.values || []).map((v) => `${e.name}:${v.value}`)
  ).filter(Boolean)
  // NLP 데이터가 없으면 intent()를 쓸 수 없다 — 학습 데이터가 없는 봇은 아예 진입하지 못한다.
  // 그때는 v0.8.0까지의 발화 매칭으로 돌아간다(브리틀하지만 동작은 한다).
  const rootGuide = intentNames.length
    ? `→ **각 루트의 condition은 intent() 하나다.** 위에 "→ condition:"이 적힌 루트는 그 값을 **그대로 복사**하라.
→ 적혀 있지 않은 루트만 '사용 가능한 인텐트' 목록에서 라벨·맥락에 맞는 이름을 골라 intent("<인텐트명>")으로 채워라.
→ 진입 조건에 발화 문자열 매칭(input.text)을 쓰지 마라 — 표현이 조금만 달라도 진입하지 못한다.`
    : `→ 각 루트의 condition에 진입 발화 트리거를 넣어라. 예: input.text.includes('진료 예약 할래'). 노드 라벨/맥락으로 어느 시나리오인지 판단.`
  const nlpSection = (intentNames.length || entityPairs.length)
    ? `\n[사용 가능한 인텐트] — 이 이름만 intent()에 쓸 수 있다. 새 이름을 지어내지 마라.\n${intentNames.map((n) => `   - ${n}`).join("\n") || "   (없음)"}\n` +
      `\n[사용 가능한 엔티티] — 이 name:value만 entity()에 쓸 수 있다.\n${entityPairs.map((n) => `   - ${n}`).join("\n") || "   (없음)"}\n`
    : ""
  return `DialogFlow 챗봇 플로우의 condition(조건식)만 채워라. 두 종류를 모두 채운다: ①시나리오 진입(루트) 트리거 ②분기 자식 선택조건.
${ruleSection}${esdSection}${nlpSection}
[사용자 입력(맥락) — 시나리오의 '진입 발화'가 트리거 근거다]
${JSON.stringify(responsesByRole, null, 2)}

[① 시나리오 진입(루트) 노드 — 각각 자기 시나리오의 진입 발화로 트리거된다. 반드시 condition을 채워라]
${rootText}
${rootGuide}

[② 분기 지점 — DialogFlow는 부모가 아니라 '자식들의 condition'으로 갈래를 고른다(서로 배타적)]
${branchText}
→ 각 갈래 자식에 배타적 condition. 예: 조회 성공="local.parkingInfo != null", 실패="local.parkingInfo == null"(api·esd가 저장한 변수로 판별). 마지막 else는 빈 값 가능.
→ **변수를 참조할 땐 위 '쓸 수 있는 변수' 목록의 이름만 써라.** 사용자 입력의 항목명(한글 라벨)을 변수명으로 지어내지 마라(예: local.역적이름 ✗ → local.traitorName ✓).
${entityPairs.length ? `→ **사용자 발화로 갈리는 분기는 entity("<엔티티명>:<값>")를 써라** — '사용 가능한 엔티티' 목록에 있는 name:value만.` : ""}
→ **한 분기의 갈래를 전부 빈 값으로 두지 마라.** 갈래가 2개 이상이면 최소한 첫 갈래에는 조건이 있어야 한다(빈 값은 마지막 else 하나만). 쓸 엔티티가 목록에 없으면 그 갈래는 input.text.includes("발화") 로라도 갈라라 — 전부 비면 봇이 어느 갈래도 고르지 못한다.

[출력 — JSON만, 다른 텍스트 금지]
{ "<노드 id>": { "condition": "<조건식>" }, ... }
- 위 모든 루트 노드와 분기 자식을 빠짐없이 포함하라(분기 마지막 else만 제외 가능).`
}

// set/esd/api의 config만 집중해서 채우는 전담 프롬프트 (작고 명확 → 신뢰성 ↑)
// rules: solution_rules(DB)에서 온 config 단계 규칙 — 어드민/학습이 관리(하드코딩 아님).
export function buildConfigPrompt(
  valueNodes: any[],
  responsesByRole: Record<string, any>,
  rules: string[] = [],
  isRetry = false,
  esdBundle?: any,
  confirmedMapping?: Array<{ esdField: string; varName: string | null }>,
): string {
  const list = valueNodes
    .map((n) => `- id=${n.id} type=${n.type} 기능="${n.label || ""}" 현재config: ${n.config ? JSON.stringify(n.config) : "(없음)"}`)
    .join("\n")
  const ruleSection = rules.length ? `\n[솔루션 규칙 — 반드시 준수]\n${rules.join("\n")}\n` : ""
  const esdSection = esdBundle ? `\n${renderEsdContract(esdBundle)}\n` : ""
  const confirmedSection = confirmedMapping ? `\n${renderConfirmedMapping(confirmedMapping)}\n` : ""
  return `DialogFlow 노드의 **config 값만** 채운다. 아래 set/esd/api 노드 각각의 config를 빠짐없이 채워라.

[사용자 입력(맥락)]
${JSON.stringify(responsesByRole, null, 2)}

[채울 노드들]
${list}
${ruleSection}${esdSection}${confirmedSection}
[형식 — 반드시 지켜라]
- set: 직전에 입력받은 값을 변수에 저장. config는 {"items":[{"key":"<스코프>.<영문변수>","value":"input.text","condition":""}]}.
- esd: config는 정확히 {type, query, result, schemaName} 형식.
  · type: 저장=create, 단건조회=findone, 다건조회=findall, 수정=update, 삭제=remove. ("insert"/"find" 같은 값 금지)
  · **조회/수정/삭제**: query는 {"where": [{"field":"<필드명>","value":"<값 또는 변수>","expression":"eq"}, ...]}. where는 **객체가 아니라 배열**이다.
  · **저장(create)**: query는 {"where": null, "data": {"<필드명>":"<값 또는 변수>", ...}}.
  · result: [{"key":"<스코프>.<영문이름>","value":"_result","condition":""}] (조회·저장 결과 _result를 변수에 담음). schemaName은 데이터 종류(예: "reservation").
  · ⚠️ query.where를 절대 평범한 객체({"name":...})로 만들지 마라 — 조회는 배열, 저장은 null이고 data에 객체.
  · **조회(findone·findall)는 config 옆에 "resultFields"도 낸다**: 조회 결과로 돌려받아 이후 멘트·분기에서 쓸 필드의 영문 키 배열(조회 조건 where 필드 제외, 최대 12개). 사용자가 외부 연동의 '받을 정보'에 적었으면 그 항목을 빠짐없이 영문 키로 옮기고(이미 영문이면 그대로), 비어 있으면 '완료 시 결과'·연동 목적에서 사용자에게 보여줄 값을 골라 정한다. 예: "보장률, 잔여 한도, 공제금 안내" → ["coverage_rate","remaining_limit","deductible"].
- api: config.apiName을 연동 목적에 맞는 이름으로.
${isRetry ? "[재시도] 직전 응답이 일부 노드 config를 비웠다. 모든 set의 items와 esd의 query를 반드시 채워라.\n" : ""}[출력 — JSON만, 다른 텍스트 금지]
{ "<id>": { "config": {...} }, "<조회 esd id>": { "config": {...}, "resultFields": ["<영문키>", ...] }, ... }
- 위 모든 노드를 포함하고 config를 비우지 마라.`
}

// 단계별 솔루션 규칙(DB 유래). 각 fill 프롬프트에 주입된다.
export interface FillRules {
  config?: string[]
  output?: string[]
  condition?: string[]
}

export interface FillResult {
  filled: number
  attempted: number
  /** 조회 ESD 스키마별 돌려받는 필드(멘트·스키마 파생 공용). 비면 키 없음. */
  esdResultFields?: Record<string, string[]>
  /** 조회 결과를 스키마에 없는 키로 참조한 멘트(관측용). */
  esdRefUnknownKeys?: Array<{ nodeId: string; ref: string; schemaName: string }>
  /** 결과를 어떤 멘트도 쓰지 않는 조회 노드(관측용). */
  esdResultUnused?: Array<{ nodeId: string; resultVar: string; schemaName: string | null }>
}

export async function fillNodeValues(
  generatedJson: any,
  responsesByRole: Record<string, any>,
  callLlm: (prompt: string) => Promise<string>,
  rules: FillRules = {},
  apiFieldsByName: Record<string, string[]> = {},
  esdBundle?: any,
  confirmedMapping?: Array<{ esdField: string; varName: string | null }>,
  nlpBundle?: NlpBundle | null,
  intentByRootId: Record<string, string> = {},
): Promise<FillResult> {
  // Main Dialog만 LLM으로 채운다. Pre/Post는 고정 보일러플레이트라 건드리지 않는다.
  const mainDialog = (generatedJson?.dialogs || []).find((d: any) => d.id === "main")
  if (!mainDialog) return { filled: 0, attempted: 0 }
  const nodes: any[] = mainDialog.nodes || []
  const targets = nodes.filter((n) => FILLABLE_TYPES.has(n.type))
  if (targets.length === 0) return { filled: 0, attempted: 0 }

  const labelById = new Map<string, string>(nodes.map((n) => [n.id, n.label || n.type]))
  const branches = computeBranches(nodes, labelById)
  // 시나리오 진입(루트) = Main dialog.then 중 greeting(=_greeting 고정)·fallback(catch-all) 제외
  const byId = new Map<string, any>(nodes.map((n) => [n.id, n]))
  const scenarioRoots = (mainDialog.then || [])
    .map((id: string) => byId.get(id))
    .filter((n: any) => n && n.type !== "greeting" && n.type !== "fallback")
    .map((n: any) => ({ id: n.id, label: n.label || n.type }))

  let filled = 0
  // 조회 노드별 resultFields(LLM이 config 옆에 낸 것). 재시도마다 더 나은 응답이 오면 덮어쓴다.
  const llmResultFields: Record<string, string[]> = {}
  // 1) 값 config 전담 패스: set/esd/api의 config를 먼저 채운다(신뢰성 ↑).
  //    output 멘트가 set/esd result 변수를 올바로 참조하려면 변수 먼저 확정돼야 하므로 output보다 앞에 둔다.
  //    set 노드의 config.items가 비어 있으면 채워질 때까지 재시도(최대 3회).
  const valueNodes = targets.filter((n) => n.type === "set" || n.type === "esd" || n.type === "api")
  if (valueNodes.length > 0) {
    const setNodes = valueNodes.filter((n) => n.type === "set")
    for (let attempt = 0; attempt < 3; attempt++) {
      const setsEmpty = setNodes.filter((n) => !(n.config?.items?.length))
      const esdApiEmpty = valueNodes.filter((n) => n.type !== "set" && !n.config)
      if (attempt > 0 && setsEmpty.length === 0 && esdApiEmpty.length === 0) break  // 다 찼으면 종료
      try {
        const patches = parsePatches(
          await callLlm(buildConfigPrompt(valueNodes, responsesByRole, rules.config || [], attempt > 0, esdBundle, confirmedMapping)),
        )
        filled += applyFillPatches(generatedJson, patches)
        Object.assign(llmResultFields, extractResultFields(nodes, patches))
      } catch (e) {
        console.warn(`[fillNodeValues] config 패스 실패(attempt ${attempt})`, e)
        continue
      }
      // 마지막 시도 후에도 비어 있으면 그대로 종료
      if (setNodes.every((n) => n.config?.items?.length)) break
    }
  }

  // 2) output 메시지 전담 패스: 의도(라벨) → 실제 멘트. 안 채워지면(텍스트=라벨) 1회 재시도.
  //    각 output에는 '앞 흐름에서 선언된' 변수만 보여줘(미선언/타 시나리오 변수 날조 차단).
  //    fallback_out은 고정 보일러플레이트라 제외.
  // 조회가 돌려주는 필드를 확정해 멘트 변수 목록에 싣는다(없으면 멘트가 값 없이 쓰이거나 없는 키를 지어냈다).
  const esdResultFields = resolveResultFields(nodes, llmResultFields, esdBundle)
  const varsByNode = availableVarsByNode(nodes, apiFieldsByName, esdResultFields)
  // 루프 종료/제어 플래그(예: context.menuDone)는 멘트에 데이터처럼 노출하면 안 되므로
  // output 멘트용 변수 맵에서만 제외한다(조건식 패스는 원본 varsByNode를 그대로 쓴다).
  const ctrlVars = loopControlVars(nodes)
  const outputVarsByNode: Record<string, AvailableVar[]> = {}
  for (const [id, vs] of Object.entries(varsByNode)) {
    outputVarsByNode[id] = ctrlVars.size ? vs.filter((v) => !ctrlVars.has(v.name)) : vs
  }
  const outputNodes = nodes.filter((n) => n.type === "output" && n.id !== "fallback_out")
  if (outputNodes.length > 0) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        filled += applyOutputMessages(generatedJson, parsePatches(
          await callLlm(buildOutputPrompt(outputNodes, responsesByRole, outputVarsByNode, rules.output || [], attempt > 0, esdBundle)),
        ))
      } catch (e) {
        console.warn(`[fillNodeValues] output 패스 실패(attempt ${attempt})`, e)
        continue
      }
      const anyFilled = outputNodes.some((n) => {
        const t = n.config?.items?.find((it: any) => it?.type === "text")?.text?.[0]?.texts?.[0]
        return t && t !== n.label
      })
      if (anyFilled) break
    }
  }

  // 3) 조건 전담 패스: 시나리오 루트 트리거 + 분기 자식 condition (둘 다 신뢰성 ↑)
  if (scenarioRoots.length > 0 || branches.length > 0) {
    try {
      filled += applyFillPatches(generatedJson, parsePatches(
        await callLlm(buildConditionPrompt(scenarioRoots, branches, responsesByRole, rules.condition || [], varsByNode, esdBundle, nlpBundle, intentByRootId)),
      ))
    } catch (e) {
      console.warn('[fillNodeValues] condition 패스 실패 — 스켈레톤 유지', e)
    }
  }

  const esdRefUnknownKeys = findUnknownEsdRefs(nodes, schemaFieldsOf(nodes, esdResultFields))
  if (esdRefUnknownKeys.length) console.warn("[fillNodeValues] 조회 결과를 스키마에 없는 키로 참조", esdRefUnknownKeys)
  const esdResultUnused = findUnusedLookups(nodes)
  return {
    filled,
    attempted: targets.length,
    ...(Object.keys(esdResultFields).length ? { esdResultFields } : {}),
    ...(esdRefUnknownKeys.length ? { esdRefUnknownKeys } : {}),
    ...(esdResultUnused.length ? { esdResultUnused } : {}),
  }
}

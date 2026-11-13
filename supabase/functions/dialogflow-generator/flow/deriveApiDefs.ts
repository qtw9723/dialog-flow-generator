// deriveApiDefs: 시나리오의 API 연동에서 DialogFlow import용 API 정의 배열을 만든다.
// - 라이브러리에서 선택한 API(name) → 그 def를 그대로 사용
// - 직접 입력(url/method/목적/보낼·받을) → LLM이 형식 초안 생성(실패 시 스켈레톤)
// ESD 스키마 생성(deriveEsdSchemas)과 동형. 실패해도 생성은 비차단.

export interface KV { key: string; value: string }
export interface DirectApi {
  name?: string     // 사용자가 입력한 API 이름(있으면 그대로 사용, 없으면 slug)
  url: string
  method: string
  purpose: string
  send: string[]
  receive: string[]
  headers: KV[]
  body: KV[]
  query?: KV[]      // GET/DELETE 쿼리 파라미터
  rawBody?: string  // JSON 통째 입력 바디(있으면 body KV 대신 우선)
  paramHint: string
}

function toKvList(v: any): KV[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((it) => it && typeof it.key === "string" && it.key.trim())
    .map((it) => ({ key: String(it.key), value: typeof it.value === "string" ? it.value : "" }))
}

// JSON 문자열을 best-effort로 content KV(최상위 키)로 변환. 중첩값은 JSON 문자열로.
// 파싱 실패하면 [] (테스트엔 rawBody가 그대로 쓰이므로 손실 아님).
function jsonToContent(raw: string, apiLabel: string, warnings?: string[]): KV[] {
  if (!raw || !raw.trim()) return []
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return []
    return Object.entries(obj).map(([key, v]) => ({
      key,
      value: typeof v === "string" ? v : JSON.stringify(v),
    }))
  } catch (e) {
    // 퇴화 동작은 그대로(빈 content, rawBody는 보존돼 손실 아님) — 사유만 추가로 남긴다.
    warnings?.push(`API 바디 JSON 파싱 실패(${apiLabel}): ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

// 응답에서 API 연동 사용 정보를 모은다(연동방식=API 항목만).
// API는 특정 시스템에 연결돼야 하므로 추측(자동매칭)하지 않는다 — 명시 선택(refNames) 또는 직접입력(directs)만.
// - refNames: 명시적으로 고른 라이브러리 API name
// - directs: 엔드포인트/헤더/바디를 직접 입력한 항목 → LLM이 형식 변환
export function collectApiUsage(responses: Record<string, any>): {
  refNames: string[]
  directs: DirectApi[]
} {
  const refNames = new Set<string>()
  const directs: DirectApi[] = []
  for (const v of Object.values(responses || {})) {
    if (!Array.isArray(v)) continue
    for (const scen of v) {
      const exts = scen?.["외부 연동"]
      if (!Array.isArray(exts)) continue
      for (const ext of exts) {
        if (!String(ext?.["연동 방식"] || "").includes("API")) continue
        const sel = ext?.["사용할 API"]
        // 등록 API 재사용: 단일 select(문자열) 또는 배열. "새로 입력"/"직접 입력"은 선택 아님.
        const NOT_REF = new Set(["", "새로 입력", "직접 입력"])
        let picked = false
        if (typeof sel === "string" && !NOT_REF.has(sel.trim())) { refNames.add(sel.trim()); picked = true }
        if (Array.isArray(sel)) for (const n of sel) if (typeof n === "string" && n.trim() && !NOT_REF.has(n.trim())) { refNames.add(n.trim()); picked = true }
        const url = ext?.["엔드포인트 URL"] || ext?.url || ext?.URL || ""
        const m = ext?.method || ""
        if (picked) continue  // 등록 API 선택 → 재사용(직접입력으로 안 봄)
        if (url || m) {
          const rawBody = String(ext?.["바디 형식"] || "") === "json" ? String(ext?.["바디 JSON"] || "") : ""
          directs.push({
            name: String(ext?.["API 이름"] || ""),
            url: String(url || ""),
            method: String(m || "get").toLowerCase(),
            purpose: String(ext?.["연동 목적"] || ""),
            send: Array.isArray(ext?.["보낼 정보"]) ? ext["보낼 정보"] : [],
            receive: Array.isArray(ext?.["받을 정보"]) ? ext["받을 정보"] : [],
            headers: toKvList(ext?.["헤더"]),
            body: toKvList(ext?.["바디"]),
            query: toKvList(ext?.["파라미터"]),
            rawBody,
            paramHint: String(ext?.["파라미터 설명"] || ""),
          })
        }
      }
    }
  }
  return { refNames: [...refNames], directs }
}

function slug(s: string): string {
  const base = (s || "").replace(/[^a-zA-Z0-9가-힣]+/g, "_").replace(/^_+|_+$/g, "")
  return base || "customApi"
}

// 사유 라벨용 API 식별자(이름>목적>URL 순, 전부 없으면 "API"). skeletonApiDef·draftApiDef가 공유.
function apiLabelOf(d: DirectApi): string {
  return d.name?.trim() || d.purpose || d.url || "API"
}

// 입력값(url/header/body/쿼리/rawBody)에서 ${변수}를 추출해 params로.
function extractParams(d: DirectApi): { name: string; desc: string }[] {
  const texts = [
    d.url,
    ...(d.headers || []).map((h) => h.value),
    ...(d.body || []).map((b) => b.value),
    ...(d.query || []).map((q) => q.value),
    d.rawBody || "",
  ]
  const names = new Set<string>()
  for (const t of texts) {
    for (const m of String(t || "").matchAll(/\$\{([^}]+)\}/g)) names.add(m[1].trim())
  }
  return [...names].map((n) => ({ name: n, desc: "" }))
}

// 직접입력(엔드포인트/헤더/쿼리/바디)을 형식에 맞게 충실히 변환(LLM 실패 시 폴백). 추측이 아니라 입력값 보존.
export function skeletonApiDef(d: DirectApi, warnings?: string[]): any {
  const method = (d.method || "get").toLowerCase()
  const isBody = method !== "get" && method !== "delete"
  const headers = (d.headers || []).filter((h) => h.key)
  const hasFormHeader = headers.some((h) => /content-type/i.test(h.key) && /x-www-form-urlencoded/i.test(h.value))
  const rawBody = (d.rawBody || "").trim()
  const apiLabel = apiLabelOf(d)
  // content: 바디 메서드면 rawBody(파싱)>바디 KV>보낼정보 키, 쿼리 메서드면 쿼리 파라미터.
  let content: KV[]
  if (isBody) {
    content = rawBody ? jsonToContent(rawBody, apiLabel, warnings)
      : (d.body || []).length ? d.body
      : (d.send || []).map((k) => ({ key: k, value: "" }))
  } else {
    content = (d.query || []).filter((q) => q.key)
  }
  const def: any = {
    name: d.name?.trim() ? d.name.trim() : slug(d.purpose || d.url),
    description: d.purpose || "직접 입력 API",
    method,
    contentType: isBody ? (hasFormHeader ? "form" : "json") : "query",
    content,
    headers,
    params: extractParams(d),
    result: { type: "json", _error: "", _result: "" },
    url: d.url || "",
    authType: "noAuth",
    authParams: {},
  }
  if (isBody && rawBody) def.rawBody = rawBody  // 테스트/호출 시 JSON 통째 전송용(content보다 우선)
  return def
}

export function buildDraftPrompt(d: DirectApi): string {
  return `사용자가 입력한 API 정보를 DialogFlow import 형식(JSON)으로 **충실히 변환**하라. 값을 지어내지 말고 입력을 보존한다.

[입력 — 사용자가 직접 입력함]
- API 이름: ${d.name?.trim() || "(미입력 — 목적/URL 기반으로 지어라)"}
- URL: ${d.url || "(미정)"}
- method: ${(d.method || "get").toUpperCase()}
- 목적: ${d.purpose || ""}
- 헤더: ${JSON.stringify(d.headers || [])}
- 쿼리 파라미터: ${JSON.stringify(d.query || [])}
- 바디(key-value): ${JSON.stringify(d.body || [])}
- 바디(JSON 통째): ${d.rawBody || "(없음)"}
- 보낼 정보(변수): ${JSON.stringify(d.send || [])}

[변환 규칙]
- url·method·headers는 입력값을 그대로 옮긴다(추측 금지).
- content: get/delete면 쿼리 파라미터를, 그 외면 바디(JSON 통째가 있으면 그 최상위 키, 없으면 key-value)를 [{"key","value"}]로 옮긴다.
- contentType: get/delete=query, 그 외=json(헤더 Content-Type이 x-www-form-urlencoded면 form).
- params: url·헤더값·쿼리값·바디값에서 \${변수} 토큰을 모아 [{"name":"변수","desc":""}]로(예: \${pid}→pid).
- name: 입력된 API 이름이 있으면 그대로, 없으면 목적/URL 기반 영문 식별자. description: 목적(한국어).
- 인증 정보를 모르면 authType="noAuth", authParams={}.

[출력 — 이 키들만, JSON 객체 하나만]
{ "name","description","method","contentType","content":[{"key","value"}],"headers":[{"key","value"}],"params":[{"name","desc"}],"result":{"type":"json","_error":"","_result":""},"url","authType","authParams":{} }
JSON만 출력.`
}

function parseJson(raw: string): any {
  if (!raw) return null
  let t = raw.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  else {
    const a = t.indexOf("{"); const b = t.lastIndexOf("}")
    if (a >= 0 && b > a) t = t.slice(a, b + 1)
  }
  try { return JSON.parse(t) } catch { return null }
}

export async function draftApiDef(d: DirectApi, callLlm: (p: string) => Promise<string>, warnings?: string[]): Promise<any> {
  const apiLabel = apiLabelOf(d)
  try {
    const def = parseJson(await callLlm(buildDraftPrompt(d)))
    if (def && typeof def === "object" && typeof def.name === "string" && def.name.trim()) {
      // 누락 필드는 스켈레톤으로 보강
      const sk = skeletonApiDef(d, warnings)
      const merged: any = { ...sk, ...def, result: def.result || sk.result, authParams: def.authParams || {} }
      // JSON 통째 바디는 정확성이 중요 → LLM이 못 바꾸게 입력 원형(rawBody/content) 강제 보존.
      if (sk.rawBody) { merged.rawBody = sk.rawBody; merged.content = sk.content }
      // 사용자가 이름을 입력했으면 LLM이 못 바꾸게 보존.
      if (d.name?.trim()) merged.name = d.name.trim()
      return merged
    }
    // 퇴화 동작은 그대로(스켈레톤 폴백) — 사유만 추가로 남긴다.
    warnings?.push(`API 정의 초안 파싱 실패(${apiLabel}): LLM 응답이 JSON 객체가 아니거나 name 누락 - 스켈레톤 폴백`)
  } catch (e) {
    // 퇴화 동작은 그대로(스켈레톤 폴백) — 사유만 추가로 남긴다.
    warnings?.push(`API 정의 LLM 초안 생성 실패(${apiLabel}): ${e instanceof Error ? e.message : String(e)}`)
  }
  return skeletonApiDef(d, warnings)
}

// 라이브러리 def(이름 매칭) + 직접입력 초안을 합쳐 API 정의 배열을 만든다(name 중복 제거).
export async function deriveApiDefs(
  responses: Record<string, any>,
  libRows: any[],
  callLlm: (p: string) => Promise<string>,
  warnings?: string[],
): Promise<any[]> {
  const usage = collectApiUsage(responses)
  const libByName = new Map<string, any>()
  for (const r of (libRows || [])) if (r?.name) libByName.set(r.name, r.api_def)

  const out: any[] = []
  const seen = new Set<string>()
  const push = (def: any) => {
    const n = def?.name
    if (!n || seen.has(n)) return
    seen.add(n); out.push(def)
  }

  for (const name of usage.refNames) {
    const def = libByName.get(name)
    if (def) push(def)
  }
  for (const d of usage.directs) {
    push(await draftApiDef(d, callLlm, warnings))
  }
  return out
}

// generatedJson에서 사용 가능한 수집 변수(set 키 + esd result 키)를 모은다.
function collectVariableNames(generatedJson: any): string[] {
  const out = new Set<string>()
  const nodes: any[] = (generatedJson?.dialogs || []).flatMap((d: any) => d?.nodes || [])
  for (const n of nodes) {
    const cfg = n?.config || {}
    if (n?.type === "set") for (const it of (cfg.items || [])) if (it?.key) out.add(it.key)
    if (n?.type === "esd") for (const r of (cfg.result || [])) if (r?.key) out.add(r.key)
  }
  return [...out]
}

export function buildParamBindPrompt(
  defs: any[],
  variables: string[],
  hints: string[],
): string {
  const defList = defs
    .filter((d) => (d.params || []).length)
    .map((d) => `- API "${d.name}" 의 파라미터: ${(d.params || []).map((p: any) => p.name).join(", ")}`)
    .join("\n")
  return `DialogFlow api 노드의 파라미터를 챗봇이 수집한 변수에 매핑하라. 각 API 파라미터에 넣을 DialogFlow 변수(또는 표현식)를 고른다.

[사용 가능한 수집 변수]
${variables.length ? variables.join(", ") : "(없음)"}

[사용자 설명(있으면 우선 반영)]
${hints.filter(Boolean).join("\n") || "(없음)"}

[매핑할 API 파라미터]
${defList || "(없음)"}

[규칙]
- 각 파라미터에 의미가 맞는 수집 변수를 매핑(예: pid ← local.patientId). 적절한 변수가 없으면 빈 문자열.
- 인증 토큰 등 수집과 무관한 값은 빈 문자열로 둔다(사용자가 이후 채움).

[출력 — JSON만]
{ "<API name>": { "<파라미터>": "<DialogFlow 변수 또는 빈 문자열>", ... }, ... }`
}

// api 노드 config.params를 LLM 매핑으로 채운다(수집 변수 → API 파라미터). 비파괴: 이미 있으면 유지.
export async function bindApiParams(
  generatedJson: any,
  defs: any[],
  responses: Record<string, any>,
  callLlm: (p: string) => Promise<string>,
  warnings?: string[],
): Promise<number> {
  const withParams = (defs || []).filter((d) => (d?.params || []).length)
  if (withParams.length === 0) return 0
  const variables = collectVariableNames(generatedJson)
  const hints = collectApiUsage(responses).directs.map((d) => d.paramHint).filter(Boolean)

  let mapping: Record<string, Record<string, string>> = {}
  try {
    const raw = await callLlm(buildParamBindPrompt(withParams, variables, hints))
    const parsed = parseJson(raw)
    if (parsed && typeof parsed === "object") mapping = parsed
    else {
      // 퇴화 동작은 그대로(매핑 실패 시 빈 params) — 사유만 추가로 남긴다.
      warnings?.push("API 파라미터 매핑 실패: LLM 응답이 JSON 객체가 아님 - 빈 매핑으로 폴백")
    }
  } catch (e) {
    // 퇴화 동작은 그대로(매핑 실패 시 빈 params) — 사유만 추가로 남긴다.
    warnings?.push(`API 파라미터 매핑 실패: ${e instanceof Error ? e.message : String(e)}`)
  }

  const nodes: any[] = (generatedJson?.dialogs || []).flatMap((d: any) => d?.nodes || [])
  const apiNodes = nodes.filter((n) => n?.type === "api")
  let applied = 0
  for (const node of apiNodes) {
    const apiName = node.config?.apiName
    const def = defs.find((d) => d?.name === apiName) || null
    const params = (def?.params || []) as { name: string }[]
    if (!params.length) continue
    node.config = node.config || {}
    if (Array.isArray(node.config.params) && node.config.params.length) continue  // 이미 있으면 유지
    const m = mapping[apiName] || {}
    node.config.params = params.map((p) => ({ key: p.name, value: typeof m[p.name] === "string" ? m[p.name] : "" }))
    applied++
  }
  return applied
}

// 생성된 JSON의 api 노드 config.apiName을 def name과 연결(순서 매핑).
// def name이 권위 — fillValues가 임시로 넣은 값(연동목적 등)을 덮어써 def·노드·params가 일관되게.
export function applyApiNames(generatedJson: any, defs: any[]): number {
  if (!defs || defs.length === 0) return 0
  const nodes: any[] = (generatedJson?.dialogs || []).flatMap((d: any) => d?.nodes || [])
  const apiNodes = nodes.filter((n) => n?.type === "api")
  let applied = 0
  apiNodes.forEach((n, i) => {
    const def = defs[Math.min(i, defs.length - 1)]
    if (!def?.name) return
    n.config = n.config || {}
    n.config.apiName = def.name
    applied++
  })
  return applied
}

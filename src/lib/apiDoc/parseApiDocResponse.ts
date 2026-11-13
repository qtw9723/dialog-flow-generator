// 자유형식 API 문서 텍스트 → api_def[] 추출용 순수 로직 (LLM 프롬프트 + 응답 정규화).
// OpenAPI가 아닌 문서(PDF·엑셀·자유 텍스트)에서 여러 API를 뽑을 때 쓴다.
// 산출 api_def 스키마는 apiDocToDef.js(OpenAPI 결정론 파서)의 출력과 동일해야 한다 — 두 경로가 같은 형태를 뱉도록.
// UI/네트워크 무관 순수 함수 — deno test 대상.

type Kv = { key: string; value: string }
type Param = { name: string; desc: string }
type ApiDef = {
  name: string
  description: string
  method: string
  contentType: string
  content: Kv[]
  headers: Kv[]
  params: Param[]
  result: { type: string; _error: string; _result: string }
  url: string
  authType: string
  authParams: Record<string, unknown>
}

export function buildApiExtractionPrompt(text: string): string {
  return `당신은 API 문서에서 API 정의를 추출하는 도우미입니다.
아래 문서에는 여러 개의 API(엔드포인트)가 있을 수 있습니다. 각 API를 하나의 객체로 만들어 JSON "배열"로만 출력하세요.

각 객체는 정확히 다음 필드를 가집니다:
{
  "name": "영문 식별자(camelCase, 예: getUser, createOrder). 공백·한글 금지",
  "description": "한 줄 설명",
  "method": "GET|POST|PUT|PATCH|DELETE 중 하나(대문자)",
  "url": "엔드포인트 URL. 경로 변수는 \${변수} 형식(예: https://api.example.com/users/\${id})",
  "contentType": "json|form|query 중 하나. GET/DELETE는 query, 요청 바디가 있으면 json",
  "headers": [{"key": "헤더명", "value": ""}],
  "content": [{"key": "바디/쿼리 키", "value": "예시값 또는 빈 문자열"}],
  "params": [{"name": "경로/쿼리 파라미터명", "desc": "설명"}]
}

규칙:
- 문서에 있는 모든 API를 빠짐없이 배열 원소로 만드세요(여러 개면 여러 개).
- 값을 알 수 없으면 빈 문자열/빈 배열로 두세요. 없는 정보를 지어내지 마세요.
- 오직 JSON 배열만 출력하세요. 설명 문장이나 코드펜스(\`\`\`)는 넣지 마세요.

문서:
"""
${text}
"""`
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
const CONTENT_TYPES = ["json", "form", "query"]

function skeleton(): ApiDef {
  return {
    name: "customApi",
    description: "",
    method: "GET",
    contentType: "query",
    content: [],
    headers: [],
    params: [],
    result: { type: "json", _error: "", _result: "" },
    url: "",
    authType: "noAuth",
    authParams: {},
  }
}

function kvArray(v: unknown): Kv[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x) => x && typeof x === "object")
    .map((x: Record<string, unknown>) => ({
      key: String(x.key ?? ""),
      value: x.value == null ? "" : String(x.value),
    }))
    .filter((x) => x.key)
}

function paramArray(v: unknown): Param[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x) => x && typeof x === "object")
    .map((x: Record<string, unknown>) => ({
      name: String(x.name ?? ""),
      desc: String(x.desc ?? x.description ?? ""),
    }))
    .filter((x) => x.name)
}

// 코드펜스(```json ... ```) 제거
function stripFences(s: string): string {
  const t = String(s || "").trim()
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fence ? fence[1].trim() : t
}

// LLM 원문 → api_def[]. 관대한 파싱: 배열이 아니면 최대한 복구하고, 항목별로 골격에 병합.
export function normalizeApiDefs(rawContent: string): ApiDef[] {
  let parsed: unknown
  const cleaned = stripFences(rawContent)
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/)
    if (!m) return []
    try { parsed = JSON.parse(m[0]) } catch { return [] }
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === "object" ? [parsed] : [])

  const out: ApiDef[] = []
  for (const item of arr) {
    if (!item || typeof item !== "object") continue
    const it = item as Record<string, unknown>
    const sk = skeleton()
    const method = String(it.method ?? "GET").toUpperCase()
    const contentType = String(it.contentType ?? "")
    out.push({
      ...sk,
      name: String(it.name ?? "").trim() || sk.name,
      description: String(it.description ?? "").trim(),
      method: METHODS.includes(method) ? method : "GET",
      contentType: CONTENT_TYPES.includes(contentType) ? contentType : sk.contentType,
      content: kvArray(it.content),
      headers: kvArray(it.headers),
      params: paramArray(it.params),
      url: String(it.url ?? "").trim(),
    })
  }
  return out
}

// API 정의 + 파라미터 샘플값 → 실제 HTTP 요청 스펙(${변수} 치환). 테스트 호출용(순수).

export function substitute(str: string, params: Record<string, string>): string {
  return String(str ?? "").replace(/\$\{([^}]+)\}/g, (_m, name) => {
    const v = params?.[String(name).trim()]
    return v != null && v !== "" ? String(v) : `\${${name}}`
  })
}

export interface RequestSpec {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

// api_def(형식) + paramValues로 fetch 가능한 요청 스펙을 만든다.
export function buildRequest(apiDef: any, paramValues: Record<string, string> = {}): RequestSpec {
  const p = paramValues || {}
  const method = String(apiDef?.method || "get").toUpperCase()
  const isBody = method !== "GET" && method !== "DELETE"
  const headers: Record<string, string> = {}
  for (const h of (apiDef?.headers || [])) {
    if (h?.key) headers[h.key] = substitute(h.value || "", p)
  }
  const content = (apiDef?.content || []).filter((c: any) => c?.key)
  const ct = apiDef?.contentType || (isBody ? "json" : "query")

  let url = substitute(apiDef?.url || "", p)
  let body: string | undefined

  const rawBody = typeof apiDef?.rawBody === "string" ? apiDef.rawBody.trim() : ""
  if (isBody && rawBody) {
    // JSON 통째 입력: content보다 우선, ${변수}만 치환해 그대로 전송.
    body = substitute(rawBody, p)
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json"
  } else if (isBody && content.length) {
    if (ct === "form") {
      body = content.map((c: any) => `${encodeURIComponent(c.key)}=${encodeURIComponent(substitute(c.value || "", p))}`).join("&")
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded"
    } else {
      const obj: Record<string, string> = {}
      for (const c of content) obj[c.key] = substitute(c.value || "", p)
      body = JSON.stringify(obj)
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json"
    }
  } else if (!isBody && content.length) {
    // query: content를 쿼리스트링으로
    const qs = content.map((c: any) => `${encodeURIComponent(c.key)}=${encodeURIComponent(substitute(c.value || "", p))}`).join("&")
    url += (url.includes("?") ? "&" : "?") + qs
  }

  return { url, method, headers, body }
}

import { FlowSpec } from "./types.ts"

export function parseFlowSpec(text: string): FlowSpec {
  // 코드펜스/본문에서 첫 JSON 객체 추출
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("FlowSpec JSON을 찾을 수 없음")

  let parsed: any
  try {
    parsed = JSON.parse(match[0])
  } catch (err) {
    throw new Error(`FlowSpec JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!parsed.entry || !Array.isArray(parsed.nodes)) {
    throw new Error("FlowSpec 형식 오류: entry/nodes 필요")
  }
  return {
    version: parsed.version || "1",
    entry: parsed.entry,
    nodes: parsed.nodes.map((n: any) => ({
      id: n.id,
      type: n.type,
      intent: n.intent || "",
      next: Array.isArray(n.next) ? n.next : [],
      ...(Array.isArray(n.variants) ? { variants: n.variants } : {}),
      ...(typeof n.scenarioName === "string" && n.scenarioName.trim() ? { scenarioName: n.scenarioName.trim() } : {}),
      ...(n.loop && typeof n.loop === "object"
        ? { loop: {
            body: Array.isArray(n.loop.body) ? n.loop.body : [],
            exitVar: typeof n.loop.exitVar === "string" ? n.loop.exitVar : "",
            max: Number.isInteger(n.loop.max) && n.loop.max > 0 ? n.loop.max : undefined,
          } }
        : {}),
    })),
  }
}

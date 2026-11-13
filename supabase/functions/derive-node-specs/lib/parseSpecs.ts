import { NodeSpec } from "./types.ts"

export function parseNodeSpecs(text: string): NodeSpec[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("노드 스펙 JSON 배열을 찾을 수 없음")
  let parsed: any
  try { parsed = JSON.parse(match[0]) } catch (err) {
    throw new Error(`스펙 JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!Array.isArray(parsed)) throw new Error("노드 스펙은 배열이어야 함")
  return parsed.map((s: any) => ({
    type: s.type,
    summary: s.summary || "",
    isTerminal: !!s.isTerminal,
    example: s.example ?? {},
    slots: Array.isArray(s.slots) ? s.slots : [],
  }))
}

import { ExtractResult, ExtractedType } from "./types.ts"

// 노드 = 'nodes' 또는 'body' 배열의 원소이면서 'type'(문자열)을 가진 객체.
// (config.items[] 같은 하위 요소는 'type'이 있어도 노드가 아니므로 제외 — 정밀도)
const NODE_ARRAY_KEYS = new Set(["nodes", "body"])
export function collectNodes(json: any): any[] {
  const out: any[] = []
  // fromNodeArray: 현재 값이 nodes/body 배열을 통해 들어왔는지
  const visit = (val: any, fromNodeArray: boolean) => {
    if (Array.isArray(val)) { for (const v of val) visit(v, fromNodeArray); return }
    if (val && typeof val === "object") {
      if (fromNodeArray && typeof val.type === "string") out.push(val)
      for (const k of Object.keys(val)) visit(val[k], NODE_ARRAY_KEYS.has(k))
    }
  }
  visit(json, false)
  return out
}

// 원시 leaf 값을 fields에 기록 (값집합·타입, 상한)
function recordLeaf(fields: Record<string, any>, path: string, value: any) {
  if (!path) return
  if (!fields[path]) fields[path] = { values: [], types: [] }
  const f = fields[path]
  const t = value === null ? "null" : typeof value
  if (!f.types.includes(t)) f.types.push(t)
  if ((typeof value !== "object") && f.values.length < 50 && !f.values.some((v: any) => v === value)) {
    f.values.push(value)
  }
}

// 판별 유니온 배열? = 원소가 모두 객체이고, 하나 이상이 문자열 'type'을 가짐
function isDiscriminatedArray(v: any): boolean {
  return Array.isArray(v) && v.length > 0 &&
    v.every((e) => e && typeof e === "object" && !Array.isArray(e)) &&
    v.some((e) => typeof e.type === "string")
}

// 객체 순회: 원시 leaf는 fields에, 판별 유니온 배열은 arrays[path].variants(type별)로 분기 수집.
function walkInto(obj: any, base: string, fields: Record<string, any>, arrays: Record<string, any>) {
  if (Array.isArray(obj)) {
    if (isDiscriminatedArray(obj)) {
      const entry = arrays[base] || { discriminator: "type", variants: {} }
      for (const el of obj) {
        const tv = typeof el.type === "string" ? el.type : "_untyped"
        const v = entry.variants[tv] || { fields: {}, arrays: {}, example: el }
        if (Object.keys(el).length > Object.keys(v.example).length) v.example = el
        walkInto(el, "", v.fields, v.arrays)   // variant 내부도 재귀(중첩 판별 배열 포함)
        entry.variants[tv] = v
      }
      arrays[base] = entry
      return
    }
    for (const el of obj) walkInto(el, base + "[]", fields, arrays)
    return
  }
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) walkInto(obj[k], base ? `${base}.${k}` : k, fields, arrays)
    return
  }
  recordLeaf(fields, base, obj)
}

export function extractByType(nodes: any[]): ExtractResult {
  const result: ExtractResult = {}
  for (const node of nodes) {
    const type = node.type
    if (typeof type !== "string") continue
    if (!result[type]) result[type] = { fields: {}, arrays: {}, example: node, count: 0, description: "" }
    const bucket = result[type] as ExtractedType
    bucket.count++
    // 더 풍부한(키 많은) 인스턴스를 대표 예시로
    if (Object.keys(node).length > Object.keys(bucket.example as any).length) bucket.example = node
    // 레퍼런스에 박아둔 노드 설명 중 가장 풍부한 것 채택 (LLM 일반화 입력)
    const desc = typeof node.description === "string" ? node.description.trim() : ""
    if (desc.length > bucket.description.length) bucket.description = desc
    walkInto(node, "", bucket.fields, bucket.arrays as Record<string, any>)
  }
  return result
}

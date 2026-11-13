import { ExtractResult, NodeSpec } from "./types.ts"

export function verifySpecs(specs: NodeSpec[], extract: ExtractResult): { specs: NodeSpec[]; warnings: string[] } {
  const warnings: string[] = []
  const kept: NodeSpec[] = []
  for (const spec of specs) {
    const ext = extract[spec.type]
    if (!ext) { warnings.push(`미지 노드 type 제거: ${spec.type}`); continue }
    const slots = []
    for (const slot of spec.slots || []) {
      // 판별 유니온 배열 슬롯: 추출 arrays에 존재해야 하고, variant 키는 추출 type만(closed-world)
      if (slot.kind === "array<variant>") {
        const da = ext.arrays?.[slot.path]
        if (!da) { warnings.push(`${spec.type}: 추출에 없는 판별배열 슬롯 제거 "${slot.path}"`); continue }
        const variants: Record<string, any> = {}
        for (const [k, v] of Object.entries(slot.variants || {})) {
          if (da.variants[k]) variants[k] = v
          else warnings.push(`${spec.type}.${slot.path}: 추출에 없는 variant 제거 "${k}"`)
        }
        slots.push({ ...slot, variants })
        continue
      }
      const field = ext.fields[slot.path]
      if (!field) { warnings.push(`${spec.type}: 추출에 없는 path 슬롯 제거 "${slot.path}"`); continue }
      if (slot.kind === "enum" && Array.isArray(slot.options)) {
        const allowed = slot.options.filter((o) => field.values.some((v) => v === o))
        if (allowed.length !== slot.options.length) warnings.push(`${spec.type}.${slot.path}: 레퍼런스 밖 enum 값 제거`)
        slots.push({ ...slot, options: allowed })
      } else {
        slots.push(slot)
      }
    }
    kept.push({ ...spec, slots })
  }
  return { specs: kept, warnings }
}

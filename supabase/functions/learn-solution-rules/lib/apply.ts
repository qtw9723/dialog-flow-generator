import { isValidCategory } from "./categories.ts"

export interface Decision {
  decision: "add" | "replace" | "edit" | "skip"
  category: string
  title: string
  description: string
  content: { text: string }
  targetRuleId?: string
}

export interface ExistingForOrder {
  id: string
  category: string
  order_index?: number
}

export type ApplyOp =
  | { op: "insert"; row: { category: string; title: string; description: string; content: { text: string }; order_index: number } }
  | { op: "update"; id: string; patch: { description: string; content: { text: string } } }
  | { op: "skip" }

export interface ApplyPlan {
  ops: ApplyOp[]
  errors: string[]
}

// 결정 배열 → DB op 목록. order_index는 카테고리별 기존 max에서 +10씩(배치 내 누적).
export function planApply(decisions: Decision[], existing: ExistingForOrder[]): ApplyPlan {
  const ops: ApplyOp[] = []
  const errors: string[] = []
  const maxByCat = new Map<string, number>()
  for (const e of existing || []) {
    const cur = maxByCat.get(e.category) ?? 0
    if ((e.order_index ?? 0) > cur) maxByCat.set(e.category, e.order_index ?? 0)
  }

  const nextOrder = (category: string): number => {
    const next = (maxByCat.get(category) ?? 0) + 10
    maxByCat.set(category, next)
    return next
  }

  for (let i = 0; i < (decisions || []).length; i++) {
    const d = decisions[i]
    if (d.decision === "skip") { ops.push({ op: "skip" }); continue }

    const isInsert = d.decision === "add" || (d.decision === "edit" && !d.targetRuleId)
    if (isInsert) {
      if (!isValidCategory(d.category)) { errors.push(`후보 ${i}: 잘못된 카테고리 '${d.category}'`); continue }
      ops.push({ op: "insert", row: { category: d.category, title: d.title, description: d.description, content: d.content, order_index: nextOrder(d.category) } })
      continue
    }
    // replace 또는 (edit + targetRuleId) → update
    if (!d.targetRuleId) { errors.push(`후보 ${i}: ${d.decision}인데 targetRuleId가 없음`); continue }
    ops.push({ op: "update", id: d.targetRuleId, patch: { description: d.description, content: d.content } })
  }

  return { ops, errors }
}

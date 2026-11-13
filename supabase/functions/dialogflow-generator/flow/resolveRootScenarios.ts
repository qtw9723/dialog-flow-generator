// 시나리오 루트 노드 ↔ 입력 시나리오 대응을 확정한다.
//
// 1순위는 LLM이 FlowSpec에 붙인 scenarioName 태그지만, 실측에서 **한 건도 태깅되지 않는 경우**가
// 나왔다(2026-08-28 은행 봇). 태그가 없으면 조건이 어느 인텐트를 써야 하는지 알 수 없고
// 결과 화면의 시나리오 헤더도 빈다. 그래서 태그 → 라벨 매칭 → 순서 짝짓기 3단으로 내려간다.
//
// 순서 짝짓기는 남은 루트 수와 남은 입력 수가 정확히 같을 때만 한다 — 개수가 어긋난 상태에서
// 억지로 짝지으면 조용히 틀린 이름이 박히고, 틀린 인텐트를 참조하는 봇은 진입 자체를 못 한다.

export type NameSource = "tag" | "label" | "index"

export interface ResolveInput {
  rootIds: string[]
  labelById: Record<string, string>
  /** collectScenarioNames(FlowSpec 태그) 결과 — rootId → 시나리오명 */
  tagged: Record<string, string>
  /** 설문에서 받은 시나리오 (순서 보존) */
  inputs: Array<{ name: string; trigger?: string }>
}

export interface ResolveResult {
  names: Record<string, string>
  source: Record<string, NameSource>
  /** 관측용 — 단계별 몇 개가 결정됐는지 */
  counts: Record<NameSource, number> & { unresolved: number }
}

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toLowerCase()

export function resolveRootScenarioNames(
  { rootIds, labelById, tagged, inputs }: ResolveInput,
): ResolveResult {
  const names: Record<string, string> = {}
  const source: Record<string, NameSource> = {}
  const usedNames = new Set<string>()

  // ① 태그 — LLM이 붙인 것을 그대로 신뢰한다.
  for (const id of rootIds) {
    const name = String(tagged?.[id] || "").trim()
    if (!name) continue
    names[id] = name
    source[id] = "tag"
    usedNames.add(norm(name))
  }

  const remainingIds = rootIds.filter((id) => !names[id])
  const remainingInputs = (inputs || [])
    .filter((s) => String(s?.name || "").trim() && !usedNames.has(norm(s.name)))

  // ② 라벨 매칭 — 루트 라벨에 시나리오명이나 진입 발화가 들어 있는 경우.
  //    후보가 정확히 하나일 때만 받아들인다(둘 이상이면 어느 쪽인지 알 수 없다).
  const stillOpen: string[] = []
  for (const id of remainingIds) {
    const label = norm(labelById?.[id])
    if (!label) { stillOpen.push(id); continue }
    const hits = remainingInputs.filter((s) => {
      if (usedNames.has(norm(s.name))) return false
      const byName = norm(s.name) && label.includes(norm(s.name))
      const byTrigger = norm(s.trigger) && label.includes(norm(s.trigger))
      return byName || byTrigger
    })
    if (hits.length === 1) {
      names[id] = hits[0].name.trim()
      source[id] = "label"
      usedNames.add(norm(hits[0].name))
    } else {
      stillOpen.push(id)
    }
  }

  // ③ 순서 짝짓기 — 남은 개수가 정확히 같을 때만.
  const leftovers = remainingInputs.filter((s) => !usedNames.has(norm(s.name)))
  if (stillOpen.length > 0 && stillOpen.length === leftovers.length) {
    stillOpen.forEach((id, i) => {
      names[id] = leftovers[i].name.trim()
      source[id] = "index"
      usedNames.add(norm(leftovers[i].name))
    })
  }

  const counts = { tag: 0, label: 0, index: 0, unresolved: 0 }
  for (const id of rootIds) {
    const s = source[id]
    if (s) counts[s]++
    else counts.unresolved++
  }
  return { names, source, counts }
}

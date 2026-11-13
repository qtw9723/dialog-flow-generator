// ESD 계약 데이터를 프롬프트 삽입용 텍스트 섹션으로 렌더한다.
// 지침 문구는 포함하지 않는다(solution_rules에서 주입됨) — 계약 데이터만.

// 사용자가 확정한 ESD 필드 ↔ 수집변수 매핑을 프롬프트 제약 섹션으로 렌더한다.
// fillNodeValues의 config 프롬프트에 주입돼 LLM이 변수명을 강제당한다.
export function renderConfirmedMapping(
  confirmedMapping: Array<{ esdField: string; varName: string | null }>,
): string {
  if (!Array.isArray(confirmedMapping) || confirmedMapping.length === 0) return ""
  const lines = [
    "[사용자 확정 매핑 — 반드시 따를 것]",
    "아래 ESD 필드명과 수집변수명을 정확히 사용하라. varName 없는 필드는 자유롭게 변수명 선택 가능.",
  ]
  for (const entry of confirmedMapping) {
    const varStr = entry.varName ? `"${entry.varName}"` : "(미매핑 — 자유 이름)"
    lines.push(`  - ESD 필드 "${entry.esdField}" → 수집변수 ${varStr}`)
  }
  return lines.join("\n")
}

export function renderEsdContract(esdBundle: any): string {
  if (!esdBundle || typeof esdBundle !== "object") return ""
  const entities: any[] = Array.isArray(esdBundle.entities) ? esdBundle.entities : []
  if (entities.length === 0) return ""

  const lines: string[] = ["[세션 ESD 계약 — 이 생성의 데이터 엔티티·필드]"]
  for (const entity of entities) {
    const entityName = entity.name || "(unnamed)"
    lines.push(`엔티티: ${entityName}`)
    const fields: any[] = Array.isArray(entity.fields) ? entity.fields : []
    for (const f of fields) {
      const name = f.name || ""
      const type = f.type || "string"
      const key = f.key === true ? "true" : "false"
      const crypt = f.crypt === "true" || f.crypt === true ? "true" : "false"
      lines.push(`  - ${name} (type=${type}, key=${key}, crypt="${crypt}")`)
    }
  }

  const apis: any[] = Array.isArray(esdBundle.apis) ? esdBundle.apis : []
  if (apis.length > 0) {
    lines.push("[ESD 연동 API]")
    for (const api of apis) {
      const name = api.name || api.apiName || "(unnamed)"
      lines.push(`  - ${name}`)
    }
  }

  return lines.join("\n")
}

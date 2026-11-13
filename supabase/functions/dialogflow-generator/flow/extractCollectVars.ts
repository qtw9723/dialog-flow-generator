// set 노드 config.items에서 수집변수 목록을 추출한다 (esd_mapping 관측성용).
// 스코프 접두사(local./context./global.)를 제거해 ESD 필드명과 이름 매칭이 가능하게 한다.
// esdBundle이 있으면 ESD 필드명(정규화 일치)과 매칭되는 변수의 type을 ESD 필드 타입으로 override한다.
// 매칭 없음 / esdBundle 없음 → 종전 "string" 기본값 유지 (회귀 없음).

function normalizeName(name: string): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "")
}

function buildEsdTypeMap(esdBundle: any): Map<string, string> {
  const typeMap = new Map<string, string>()
  const entities: any[] = esdBundle?.entities ?? []
  for (const entity of entities) {
    for (const field of entity?.fields ?? []) {
      if (typeof field?.name === "string" && typeof field?.type === "string") {
        typeMap.set(normalizeName(field.name), field.type)
      }
    }
  }
  return typeMap
}

export function extractCollectVarsFromJson(
  generatedJson: any,
  esdBundle?: any,
): Array<{ name: string; type: string }> {
  const nodes: any[] = (generatedJson?.dialogs || []).flatMap((d: any) => d?.nodes || [])
  const vars: Array<{ name: string; type: string }> = []
  const seen = new Set<string>()
  const esdTypeMap = esdBundle ? buildEsdTypeMap(esdBundle) : null
  for (const n of nodes) {
    if (n?.type === "set") {
      for (const item of n.config?.items || []) {
        if (typeof item?.key === "string" && item.key && !seen.has(item.key)) {
          seen.add(item.key)
          const rawName = item.key.replace(/^(?:local|context|global)\./, "")
          const esdType = esdTypeMap?.get(normalizeName(rawName))
          vars.push({ name: rawName, type: esdType ?? "string" })
        }
      }
    }
  }
  return vars
}

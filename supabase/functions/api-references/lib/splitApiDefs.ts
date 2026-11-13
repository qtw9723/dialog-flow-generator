// API import 형식 입력(단일 객체 또는 배열)을 dialogflow_api_references 행 입력으로 정규화.
// 각 def의 name(필수)·description·method를 파생한다. name 없는 원소는 제외.

export interface ApiRefRow {
  api_def: any
  name: string
  description: string
  method: string
}

export function splitApiDefs(input: any): ApiRefRow[] {
  const arr = Array.isArray(input) ? input : (input ? [input] : [])
  const rows: ApiRefRow[] = []
  for (const def of arr) {
    if (!def || typeof def !== "object") continue
    const name = typeof def.name === "string" ? def.name.trim() : ""
    if (!name) continue
    rows.push({
      api_def: def,
      name,
      description: typeof def.description === "string" ? def.description : "",
      method: typeof def.method === "string" ? def.method : "",
    })
  }
  return rows
}

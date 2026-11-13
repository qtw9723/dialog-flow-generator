// 생성된 dialog의 ESD 노드에서 ESD 스키마 정의를 파생한다.
// DialogFlow ESD에 별도 import할 스키마 파일(들)을 만들어 결과와 함께 전달하기 위함.

import { schemaFieldsOf } from "./esdFields.ts"

interface SchemaField {
  readOnly: boolean
  name: string
  type: string // string | number | boolean | geo
  key: boolean
  useSearch: boolean
  crypt: string // "true" | "false"
  description: string
}
export interface EsdSchema {
  name: string
  description: string
  tags: string
  createdBy: string
  createdAt: string
  fields: SchemaField[]
  resultSamples: unknown[]
  retentionPeriod: string
  criteriaField: string
}

// Main dialog의 esd 노드에서 schemaName별 필드명(순서 보존, 중복 제거) 수집.
// 필드 계산은 esdFields.schemaFieldsOf 한 곳 — 멘트 변수 목록과 같은 목록이어야 멘트가 쓰는 키가 스키마에 있다.
// resultFieldsBySchema: 조회가 돌려주는 필드(fillNodeValues가 확정). 없으면 data·where 필드만.
export function collectEsdFields(generatedJson: any, resultFieldsBySchema: Record<string, string[]> = {}): Record<string, string[]> {
  const mainDialog = (generatedJson?.dialogs || []).find((d: any) => d.id === "main")
  return schemaFieldsOf(mainDialog?.nodes || [], resultFieldsBySchema)
}

export function buildSchemaPrompt(schemaName: string, fields: string[]): string {
  return `DialogFlow ESD(데이터 스키마)의 각 필드 속성을 추론하라. 스키마 "${schemaName}"의 필드들이다.

[필드 목록]
${fields.map((f) => `- ${f}`).join("\n")}

[추론 규칙]
- type: "string" | "number" | "boolean" | "geo" 중 하나. 전화번호·이름·내용 등 텍스트=string(전화번호도 string), 수량·개수·금액·나이=number, 여부/플래그(is~,has~)=boolean, 좌표=geo.
- crypt: 개인정보(이름·전화번호·이메일·주소·생년월일·주민번호 등)면 "true", 아니면 "false".
- key: 레코드를 식별하는 필드(예약번호·id·번호 등) 하나만 true, 나머지 false. 식별자가 없으면 모두 false.

[출력 — JSON만, 다른 텍스트 금지]
{ "<필드명>": { "type": "...", "crypt": "true"|"false", "key": true|false }, ... }
- 위 모든 필드를 포함하라.`
}

function parseJsonObject(raw: string, schemaName: string, warnings?: string[]): Record<string, any> {
  if (!raw) {
    // 퇴화 동작은 그대로(빈 객체 → 이후 전부 string 폴백) — 사유만 추가로 남긴다.
    warnings?.push(`ESD 필드 타입 추론 실패(${schemaName}): LLM 응답이 비어있음 - 전 필드 string 타입으로 폴백`)
    return {}
  }
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  else {
    const a = text.indexOf("{"), b = text.lastIndexOf("}")
    if (a >= 0 && b > a) text = text.slice(a, b + 1)
  }
  try {
    const o = JSON.parse(text)
    if (o && typeof o === "object" && !Array.isArray(o)) return o
    // 퇴화 동작은 그대로(빈 객체 → 이후 전부 string 폴백) — 사유만 추가로 남긴다.
    warnings?.push(`ESD 필드 타입 추론 실패(${schemaName}): LLM 응답이 JSON 객체가 아님 - 전 필드 string 타입으로 폴백`)
    return {}
  } catch (e) {
    // 퇴화 동작은 그대로(빈 객체 → 이후 전부 string 폴백) — 사유만 추가로 남긴다.
    warnings?.push(`ESD 스키마 파생 실패(${schemaName}): LLM 응답 JSON 파싱 실패 - ${e instanceof Error ? e.message : String(e)}`)
    return {}
  }
}

const VALID_TYPES = new Set(["string", "number", "boolean", "geo"])

export async function deriveEsdSchemas(
  generatedJson: any,
  callLlm: (prompt: string) => Promise<string>,
  nowIso: string,
  warnings?: string[],
  resultFieldsBySchema: Record<string, string[]> = {},
): Promise<EsdSchema[]> {
  const bySchema = collectEsdFields(generatedJson, resultFieldsBySchema)
  const schemas: EsdSchema[] = []

  for (const [schemaName, fields] of Object.entries(bySchema)) {
    if (fields.length === 0) continue
    // 스마트 추론(집중 LLM). 실패/누락은 안전 기본값으로 폴백.
    let inferred: Record<string, any> = {}
    try {
      inferred = parseJsonObject(await callLlm(buildSchemaPrompt(schemaName, fields)), schemaName, warnings)
    } catch (e) {
      // 퇴화 동작은 그대로(빈 객체 → 이후 전부 string 폴백) — 사유만 추가로 남긴다.
      inferred = {}
      warnings?.push(`ESD 필드 타입 추론 실패(${schemaName}): ${e instanceof Error ? e.message : String(e)}`)
    }

    const schemaFields: SchemaField[] = fields.map((name) => {
      const info = inferred[name] || {}
      const type = VALID_TYPES.has(info.type) ? info.type : "string"
      const crypt = info.crypt === "true" || info.crypt === true ? "true" : "false"
      const key = info.key === true
      return { readOnly: false, name, type, key, useSearch: false, crypt, description: "" }
    })

    schemas.push({
      name: schemaName,
      description: `자동 생성된 ESD 스키마 (${schemaName})`,
      tags: "",
      createdBy: "DialogFlow Generator",
      createdAt: nowIso,
      fields: schemaFields,
      resultSamples: [],
      retentionPeriod: "",
      criteriaField: "updatedAt",
    })
  }

  return schemas
}

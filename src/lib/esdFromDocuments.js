// 파싱된 문서 데이터에서 ESD {entities, apis}를 조립한다 (순수 모듈, 파일 I/O·UI 무의존).
// sheets = [{schemaName, headers, rows}] (0~N), apis = api_def[] (0~N)
// → {entities: EsdSchema[], apis: api_def[]}

import { inferEsdFields } from './inferEsdFields.js'
import { buildEsdSchema } from './buildEsdSchema.js'

/**
 * @param {{
 *   sheets?: Array<{ schemaName: string, headers: string[], rows: Array<Record<string,string>> }>,
 *   apis?: object[],
 *   createdAt?: string,
 * }} param
 * @returns {{ entities: object[], apis: object[] }}
 */
export function esdFromDocuments({ sheets = [], apis = [], createdAt } = {}) {
  if (!createdAt) createdAt = new Date().toISOString()

  const entities = (sheets || []).map(({ schemaName, headers = [], rows = [] }) => {
    const fieldSpecs = inferEsdFields({ headers, rows })
    return buildEsdSchema({ schemaName, headers, fieldSpecs, createdAt })
  })

  return { entities, apis: apis || [] }
}

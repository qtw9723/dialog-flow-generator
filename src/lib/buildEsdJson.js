// 에디터 상태 → esd_json 조립 (순수 모듈, UI·파싱 라이브러리 무의존).
// esd_json 계약: { entities: EsdSchema[], apis: api_def[] }

import { buildEsdSchema } from './buildEsdSchema.js'

/**
 * 에디터 엔티티 배열 + api_def 배열 → esd_json.
 *
 * @param {{
 *   entities: Array<{
 *     schemaName: string,
 *     fields: Array<{ name: string, type?: string, key?: boolean, crypt?: string|boolean }>,
 *     createdAt: string,
 *   }>,
 *   apis: object[],
 * }} param
 * @returns {{ entities: object[], apis: object[] }}
 */
export function buildEsdJson({ entities = [], apis = [] }) {
  const builtEntities = (entities || []).map((entity) => {
    const { schemaName, fields = [], createdAt } = entity
    const headers = (fields || []).map((f) => f.name)
    const fieldSpecs = {}
    for (const f of (fields || [])) {
      fieldSpecs[f.name] = { type: f.type, key: f.key, crypt: f.crypt }
    }
    return buildEsdSchema({ schemaName, headers, fieldSpecs, createdAt })
  })

  return { entities: builtEntities, apis: apis || [] }
}

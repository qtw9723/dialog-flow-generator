// 파생 ESD 스키마(generation_tiers.esd_schemas) → 편집 가능한 ESD 번들(generation_tiers.esd).
// 순수 모듈. deriveEsdSchemas가 내는 EsdSchema는 buildEsdSchema와 키 집합이 동일하므로
// (buildEsdSchema.js 주석 참고) 편집 번들의 entities 형태와 이미 호환된다 — 감싸기만 하면 된다.
// NL 자동추출 등으로 생성된 읽기전용 ESD를 EsdEditor로 불러와 편집할 때 seed로 쓴다.

/**
 * @param {Array<object>|null|undefined} esdSchemas - generation_tiers.esd_schemas
 * @returns {{ entities: object[], apis: object[] }} EsdEditor initialEsdJson 형태
 */
export function esdSchemasToBundle(esdSchemas) {
  if (!Array.isArray(esdSchemas)) return { entities: [], apis: [] }
  const entities = esdSchemas.filter((s) => s && typeof s === 'object' && !Array.isArray(s))
  return { entities, apis: [] }
}

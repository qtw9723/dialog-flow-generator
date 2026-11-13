// 시나리오 하나에 귀속되는 자산(ESD·인텐트·엔티티·API)을 flow 서브트리에서 계산한다 (순수).
//
// 왜 필요한가: 결과 안의 자산은 시나리오별로 갈라져 저장되지 않는다 —
// ESD는 스키마 이름으로, 엔티티는 평평한 배열로, API는 이름으로만 모여 있다.
// 갈라져 있지 않은 것들은 flow 구조를 훑어 되짚고, 인텐트는 **이름**으로 맞춘다.
//
// 읽기는 정규화된 번들(result.bundle)만 받는다 — 원시 generation_tiers를 넘기지 마라.

import { walk, scenarioRootIds, boilerplateRootIds, indexNodes } from '../flow/flowToScenarios.js'
import { intentNameOf } from '../nlp/intentName.js'

/** entity("이름") · entities("이름") 전부. 콜론 뒤 값(카드종류:신용카드)은 떼고 이름만 쓴다. */
const ENTITY_CALL = /entit(?:y|ies)\(\s*['"]([^'"]+)['"]/g

const arr = (v) => (Array.isArray(v) ? v : [])

/** 순서를 보존하며 빈 값과 중복을 버린다. */
function uniqNames(names) {
  const seen = new Set()
  const out = []
  for (const raw of names) {
    const n = String(raw ?? '').trim()
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

/**
 * scenarioSubtreeIds의 본체 — byId와 **roots를 밖에서 받아** scenarioAssetsAt과 공유한다.
 * (scenarioAssetsAt이 인텐트 이름 조회에 rootId를 써야 해서 루트 목록을 두 번 계산하지 않는다.)
 */
function subtreeIdsWithIndex(flow, index, byId, roots) {
  const rootId = roots[index]
  if (!rootId) return []
  const stopAt = new Set([...roots.filter((id) => id !== rootId), ...boilerplateRootIds(flow)])
  return walk(rootId, byId, stopAt)
}

/**
 * index번째 시나리오의 서브트리 노드 id.
 * ⚠ stopAt에 **다른 시나리오 루트 + greeting/fallback 루트**를 반드시 넘긴다.
 * flowToScenarios는 walk를 stopAt 없이 부르므로(주석이 코드보다 강하게 적혀 있다),
 * 그 호출을 따라 하면 옆 시나리오의 자산까지 끌어온다.
 * @returns {string[]} 방문 순서. 범위 밖 인덱스면 빈 배열.
 */
export function scenarioSubtreeIds(flow, index) {
  return subtreeIdsWithIndex(flow, index, indexNodes(flow), scenarioRootIds(flow))
}

/**
 * index번째 시나리오에 귀속되는 자산.
 * @param {object|null|undefined} flow generated_json
 * @param {object|null|undefined} bundle 정규화된 result.bundle
 * @param {number} index 시나리오 인덱스(scenarioRootIds·flowToScenarios와 같은 순서)
 * @returns {{esd_schemas: object[], nlp: {intents: object[], entities: object[]}, api_defs: object[]}}
 */
export function scenarioAssetsAt(flow, bundle, index) {
  const byId = indexNodes(flow)
  const roots = scenarioRootIds(flow)
  const ids = subtreeIdsWithIndex(flow, index, byId, roots)

  const esdNames = []
  const apiNames = []
  const entityNames = []
  for (const id of ids) {
    const n = byId.get(id)
    if (!n) continue
    if (n.type === 'esd') esdNames.push(n.config?.query?.schemaName ?? n.config?.schemaName)
    if (n.type === 'api') apiNames.push(n.config?.apiName)
    for (const m of String(n.condition || '').matchAll(ENTITY_CALL)) {
      entityNames.push(String(m[1]).split(':')[0])
    }
  }

  const wantEsd = new Set(uniqNames(esdNames))
  const wantApi = new Set(uniqNames(apiNames))
  const wantEntity = new Set(uniqNames(entityNames))

  // 인텐트는 **이름**으로 맞춘다 — 위치로 맞추면 안 된다.
  //
  // ⚠ `bundle.nlp.intents`의 순서는 **설문 응답 순서**다:
  // dialogflow-generator/index.ts가 `deriveNlpData(collectScenarioDetails(responses), …)`로
  // 만들기 때문이다. 반면 `index`는 `main.then` 안의 자리, 즉 **LLM이 플로우 루트를 내놓은
  // 순서**다. 이 둘이 어긋난다는 것은 저장소가 이미 증명한다 — `flow/resolveRootScenarios.ts`가
  // 존재하는 이유 자체가 rootId→시나리오명을 태그 → 라벨 → (최후수단) 순서 짝짓기로 복구하는
  // 것이고, 행마다 `scenario_name_resolution`·`scenario_name_mismatch` 카운터가 어느 단계까지
  // 내려갔는지 기록한다. `assembled` 행은 더 심하다: `mergeScenarioAssets`가 인텐트를 이름
  // 기준으로 중복 제거하고 인텐트 없는 자산은 그대로 통과시키므로, 인텐트 개수가 시나리오
  // 개수와 같을 보장조차 없다.
  //
  // 이름의 유일 소스는 `src/lib/nlp/intentName.js`(엣지함수의 `assignIntentNames`가 쓰는 규칙).
  // 이름을 못 정하는 경우(레거시 행에 `bundle.scenarios`가 없거나, 이 루트의 항목이 없거나,
  // 정규화 결과가 빈 문자열)에만 옛 위치 기반 조회로 폴백한다.
  const rootId = roots[index]
  const scenName = bundle?.scenarios?.[rootId]
  const want = intentNameOf(scenName)
  const intent = want
    ? arr(bundle?.nlp?.intents).find((i) => String(i?.name ?? '').trim() === want)
    : arr(bundle?.nlp?.intents)[index]

  return {
    esd_schemas: arr(bundle?.esd_schemas).filter((s) => wantEsd.has(String(s?.name ?? '').trim())),
    nlp: {
      intents: intent ? [intent] : [],
      entities: arr(bundle?.nlp?.entities).filter((e) => wantEntity.has(String(e?.name ?? '').trim())),
    },
    api_defs: arr(bundle?.api_defs).filter((d) => wantApi.has(String(d?.name ?? '').trim())),
  }
}

/** 화면에 "ESD 2 · 인텐트 1 · 엔티티 3 · API 1"로 보일 개수. */
export function assetCounts(assets) {
  return {
    esd: arr(assets?.esd_schemas).length,
    intents: arr(assets?.nlp?.intents).length,
    entities: arr(assets?.nlp?.entities).length,
    api: arr(assets?.api_defs).length,
  }
}

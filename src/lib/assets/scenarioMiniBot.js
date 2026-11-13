// 결과 봇에서 시나리오 하나만 남긴 자체-완결 미니봇을 뽑는다 (순수).
//
// 산출물은 기존 레퍼런스 행(dialogflow_scenario_references.flow_json)과 **같은 모양**이어야 한다:
// greeting + 시나리오 1개 + fallback. 그래야 assembleScenarios가 손대지 않고 그대로 먹는다
// (그 함수는 첫 미니봇의 greeting/fallback만 살려 base로 쓴다 — 없으면 조립물에 인사말이 없다).
//
// ⚠ 기존 추출 두 개를 그대로 못 쓴다: seedPortion은 시나리오를 하나로 고르지 않고,
// scenarioPortion(few-shot용)은 then만 순회해 루프 body 자식을 놓친다.
//
// 순회는 `walk()`(flowToScenarios.js)를 그대로 쓴다. 여기서 다루는 노드 우주는 `main.nodes`
// 배열 하나뿐인데(predialog·postdialog 등 다른 다이얼로그는 손대지 않고 그대로 보존한다),
// `walk(rootId, byId, stopAt)`은 **byId 맵을 인자로 받으므로** 그 맵을 그대로 넘기면 된다 —
// 색인을 만드는 `indexNodes()`(전체 다이얼로그 색인)만 여기서 쓸 수 없고 walk는 색인 무관이다.
//
// 경계: 시나리오 서브트리는 **다른 시나리오 루트 + 보일러플레이트 루트**에서 멈춘다 —
// scenarioAssets.js의 scenarioSubtreeIds가 쓰는 stopAt과 의도적으로 똑같은 경계다.
// 자산 귀속이 옆 시나리오의 esd/api를 배제하는데 flow_json이 그 노드를 여전히 담고 있으면
// 등록된 행이 자기모순이 된다 — 추출과 귀속은 반드시 같은 경계를 써야 한다.
// 보일러플레이트(greeting/fallback) 서브트리는 경계 없이 그대로 따라간다.

import { walk, scenarioRootIds, boilerplateRootIds } from '../flow/flowToScenarios.js'

/**
 * @param {object|null|undefined} flow generated_json
 * @param {number} index 시나리오 인덱스(scenarioRootIds와 같은 순서)
 * @returns {object|null} 원본과 같은 shape의 미니봇(깊은 복사). 못 뽑으면 null.
 */
export function extractScenarioMiniBot(flow, index) {
  const roots = scenarioRootIds(flow)
  const rootId = roots[index]
  if (!rootId) return null
  const bot = structuredClone(flow)
  const main = (bot.dialogs || []).find((d) => d?.id === 'main')
  if (!main) return null

  const byId = new Map((main.nodes || []).map((n) => [n.id, n]))
  const boiler = boilerplateRootIds(bot)
  // scenarioSubtreeIds(scenarioAssets.js)와 같은 경계: 다른 시나리오 루트 + 보일러플레이트 루트에서 멈춘다.
  const stopAt = new Set([...roots.filter((id) => id !== rootId), ...boiler])
  // 보일러플레이트 서브트리 + 고른 시나리오 서브트리(경계 안)만 남긴다.
  // 보일러플레이트는 루트가 여럿(greeting·fallback)이라 루트별로 walk해 합친다.
  const keep = new Set([...boiler.flatMap((id) => walk(id, byId)), ...walk(rootId, byId, stopAt)])

  main.nodes = (main.nodes || []).filter((n) => keep.has(n.id))
  // 잘려나간 노드로의 죽은 참조를 남기지 않는다 — 등록된 미니봇은 자기 밖 노드를 가리키면 안 된다.
  // keep에 남은 보일러플레이트로의 간선(예: 루프에서 fallback로의 폴백)은 살아남는다.
  for (const n of main.nodes) {
    if (Array.isArray(n.then)) n.then = n.then.filter((id) => keep.has(id))
    if (Array.isArray(n.body)) n.body = n.body.filter((id) => keep.has(id))
  }
  // 루트 순서는 원본 순서를 따른다(greeting이 앞, fallback가 뒤라는 관례 유지).
  main.then = (main.then || []).filter((id) => id === rootId || boiler.includes(id))
  return bot
}

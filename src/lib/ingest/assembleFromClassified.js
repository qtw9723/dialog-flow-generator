// 분류된 종류별 추출물을 받아 세션 ESD와 시나리오 초안으로 종합한다 (순수 모듈, 파일 I/O·LLM 무의존).
// esdSheets: [{schemaName, headers, rows}] (0~N)
// apiDefs: api_def[] (0~N)
// scenarioDocs: Extracted[] = [{scenarios, botName?, personality?}] (0~N)
// → { sessionEsd: {entities, apis}|null, scenarioDraft: Extracted|null }

import { esdFromDocuments } from '../esdFromDocuments.js'

/**
 * @param {{
 *   esdSheets?: Array<{ schemaName: string, headers: string[], rows: Array<Record<string,string>> }>,
 *   apiDefs?: object[],
 *   scenarioDocs?: Array<{ scenarios: object[], botName?: string, personality?: string }>,
 *   createdAt?: string,
 * }} param
 * @returns {{ sessionEsd: {entities: object[], apis: object[]}|null, scenarioDraft: {scenarios: object[], botName?: string, personality?: string}|null }}
 */
export function assembleFromClassified({ esdSheets = [], apiDefs = [], scenarioDocs = [], createdAt } = {}) {
  let sessionEsd = null
  if (esdSheets.length > 0 || apiDefs.length > 0) {
    sessionEsd = esdFromDocuments({
      sheets: esdSheets,
      apis: apiDefs,
      ...(createdAt !== undefined ? { createdAt } : {}),
    })
  }

  let scenarioDraft = null
  if (scenarioDocs.length > 0) {
    const scenarios = scenarioDocs.flatMap(d => d.scenarios ?? [])
    const botName = scenarioDocs.find(d => d.botName != null && d.botName !== '')?.botName
    const personality = scenarioDocs.find(d => d.personality != null && d.personality !== '')?.personality
    scenarioDraft = { scenarios }
    if (botName != null) scenarioDraft.botName = botName
    if (personality != null) scenarioDraft.personality = personality
  }

  return { sessionEsd, scenarioDraft }
}

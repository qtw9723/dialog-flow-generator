import { routeApiDoc } from './routeApiDoc.js'
import { parseApiDocToDefs } from '../parseApiDoc.js'

/**
 * API 문서 파일에서 api_def 배열을 추출한다.
 * 결정론 OpenAPI 파싱 우선, 실패/freeform 시 LLM 폴백.
 *
 * @param {File} file
 * @param {{ callApiDocParse: (text: string) => Promise<{defs: any[]}>, extractText: (file: File) => Promise<string> }} deps
 * @returns {Promise<{ defs: any[], source: string|null, error: string|null }>}
 */
export async function extractApiDefsFromFile(file, { callApiDocParse, extractText }) {
  let text
  try {
    text = await extractText(file)
  } catch (err) {
    return { defs: [], source: null, error: err?.message ?? '텍스트 추출에 실패했습니다.' }
  }

  const route = routeApiDoc(text)

  if (route === 'openapi') {
    const { defs, error } = parseApiDocToDefs(text)
    if (!error && defs.length > 0) {
      return { defs, source: 'openapi', error: null }
    }
  }

  // freeform이거나 결정론 파싱이 빈 결과/실패한 경우 LLM 폴백.
  // ⚠ LLM 호출이 던지더라도 여기서 잡아 반환 계약({defs, source, error})으로 돌려준다.
  //    이 함수를 Promise.all로 파일마다 돌리는 호출부가 있어(PocDocGenerateFlow·NlScenarioFlow의
  //    다중 파일 라우팅), 던지면 API 문서 한 건의 429가 ESD·시나리오까지 통째로 중단시킨다.
  let result
  try {
    result = await callApiDocParse(text)
  } catch (err) {
    return { defs: [], source: 'llm', error: err?.message ?? 'API 문서를 읽지 못했습니다.' }
  }
  const llmDefs = result?.defs ?? []
  if (llmDefs.length === 0) {
    return { defs: [], source: 'llm', error: '문서에서 API 정의를 추출하지 못했습니다.' }
  }
  return { defs: llmDefs, source: 'llm', error: null }
}

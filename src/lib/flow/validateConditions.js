// 조건식 검증 (순수) — 다이어그램 편집 재검증에서 노드 condition의 문법·변수 참조를 점검한다.
// 기존 재검증(validateFlowClient)은 그래프 위상만 보고 condition 값은 아예 사영하지 않아
// 잘못된 조건식이 100% 통과하던 공백을 메운다.
// - error: 괄호/따옴표 불균형 등 명백한 문법 오류 → 확정 차단.
// - warning: 추적 스코프(local/context/secure) 변수가 flow에 정의돼 있지 않음 → 노출(비차단).
import { availableVars } from './conditionBuilder.js'

/**
 * @param {object} flow - generated_json 머신 다이얼로그 트리
 * @returns {Array<{nodeId:string, condition:string, severity:'error'|'warning', message:string}>}
 */
export function validateConditions(flow) {
  const known = new Set(availableVars(flow))
  const issues = []
  for (const d of (flow?.dialogs || [])) {
    for (const n of (d?.nodes || [])) {
      const cond = typeof n?.condition === 'string' ? n.condition.trim() : ''
      if (!cond) continue

      // 1) 문법: 괄호·따옴표 균형(간단 정적 점검) — 불균형이면 명백한 오류.
      const parensBalanced = countChar(cond, '(') === countChar(cond, ')')
      const singleQuotesEven = countChar(cond, "'") % 2 === 0
      const doubleQuotesEven = countChar(cond, '"') % 2 === 0
      if (!parensBalanced || !singleQuotesEven || !doubleQuotesEven) {
        issues.push({ nodeId: n.id, condition: cond, severity: 'error', message: '조건식 문법 오류(괄호/따옴표 불균형)' })
        continue  // 문법이 깨지면 변수 점검은 의미 없음
      }

      // 2) 변수 참조: 추적 스코프 접두사를 가진 토큰이 flow에 정의돼 있는지.
      //    (미추적 스코프·특수변수·리터럴은 건드리지 않아 오탐을 줄인다.)
      const refs = cond.match(/\b(?:local|context|secure)\.[A-Za-z_][A-Za-z0-9_]*/g) || []
      for (const r of [...new Set(refs)]) {
        if (!known.has(r)) {
          issues.push({ nodeId: n.id, condition: cond, severity: 'warning', message: `정의되지 않은 변수 참조: ${r}` })
        }
      }
    }
  }
  return issues
}

function countChar(s, ch) {
  let c = 0
  for (const x of s) if (x === ch) c++
  return c
}

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
// constants.js는 최상단에서 import.meta.env를 읽어 Deno에서 로드조차 되지 않는다
// (scenarioCategories.js의 선례와 동일한 사유) — 유일 소스인 solutionRuleCategories.js에서 바로 가져온다.
import { SOLUTION_RULE_DB_CATEGORIES } from './solutionRuleCategories.js'
import { VALID_CATEGORIES, RULE_STAGE_BY_CATEGORY, categoryDescriptions }
  from '../../supabase/functions/_shared/solutionRuleCategories.ts'

// 이 저장소는 같은 카테고리 목록이 여러 곳에 복제됐다가 한 곳만 고쳐지는 사고를 반복했다
// (learn 쪽이 7종에 머물러 Loop Rule을 유효하지 않다고 판단한 이력).
Deno.test('프론트 카테고리 목록이 엣지 VALID_CATEGORIES와 같다', () => {
  assertEquals([...SOLUTION_RULE_DB_CATEGORIES].sort(), [...VALID_CATEGORIES].sort())
})

Deno.test('모든 카테고리에 설명이 있다', () => {
  for (const c of VALID_CATEGORIES) assertEquals(c in categoryDescriptions, true, c)
})

Deno.test('Document Term Mapping은 stage가 없다 — 추출 단계가 소비하는 사전이다', () => {
  assertEquals(VALID_CATEGORIES.includes('Document Term Mapping'), true)
  assertEquals('Document Term Mapping' in RULE_STAGE_BY_CATEGORY, false)
})

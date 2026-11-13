// solution_rules 카테고리의 **단일 소스** — 목록·설명·프롬프트 단계 매핑.
//
// 왜 _shared인가: 같은 목록이 세 곳에 복제돼 있었고 **이미 어긋났다**(2026-08-28).
//   dialogflow-generator/flow/rules.ts   — stage 매핑 (9종 반영됨)
//   admin-solution-rules/index.ts        — VALID_CATEGORIES (9종)
//   learn-solution-rules/lib/categories.ts — 전부 복제 (**7종에 머물러 있었다**)
// learn 쪽은 "엣지 함수 간 import 회피"로 일부러 복제한 것인데, 그 복제가 Loop Rule과
// NLP Function Reference를 놓쳐 학습이 그 카테고리를 유효하지 않다고 판단하고 있었다.
//
// ⚠ 새 카테고리를 추가할 때 손댈 곳: 이 파일 + DB CHECK 제약(마이그레이션) + 프론트
//    `src/lib/constants.js`. 엣지 함수 쪽은 전부 이 파일을 본다.

export type RuleStage = "flow" | "config" | "output" | "condition"

export const VALID_CATEGORIES: readonly string[] = [
  "Solution Rule",
  "System Variable",
  "Node Usage Rule",
  "Variable Usage Rule",
  "Value Generation Rule",
  "Output Message Rule",
  "Condition Rule",
  "Loop Rule",
  "NLP Function Reference",
  "Document Term Mapping",
]

export const categoryDescriptions: Record<string, string> = {
  "Solution Rule": "솔루션 규칙 - 솔루션이 따라야 할 기본 원칙과 제약조건",
  "System Variable": "시스템 변수 - 자동으로 생성되는 변수와 그 설명",
  "Node Usage Rule": "노드 사용 규칙 - 플로우 구조·노드 종류 사용 규칙",
  "Variable Usage Rule": "변수 사용 규칙 - 변수 명명·스코프·선언 순서 규칙",
  "Value Generation Rule": "값 생성 규칙 - set/esd config 값과 식별자 생성 규칙",
  "Output Message Rule": "출력 멘트 규칙 - output 노드 안내 문장·변수 참조 규칙",
  "Condition Rule": "조건 규칙 - 시나리오 진입 트리거·분기 조건식 규칙",
  "Loop Rule": "반복 규칙 - 루프 노드의 탈출 조건·본문 구성 규칙",
  "NLP Function Reference": "NLP 함수 규약 - intent/entity 함수의 인자·반환 규약(조건 작성 참조용)",
  "Document Term Mapping": "문서 용어 사전 - 외부 문서의 열 이름을 우리 필드로 대응",
}

// 카테고리 → 주입될 프롬프트 단계들.
// (System Variable은 필드/레퍼런스 성격이라 생성 프롬프트에 직접 주입하지 않는다.
//  Loop Rule은 코드가 소비하는 튜너블이라 프롬프트에 직접 주입하지 않는다.)
export const RULE_STAGE_BY_CATEGORY: Record<string, RuleStage[]> = {
  "Solution Rule": ["flow"],
  "Node Usage Rule": ["flow"],
  // condition 포함: 분기 조건도 항목명이 아닌 변수명을 쓰도록 변수 규칙이 condition 단계에 주입돼야 한다.
  "Variable Usage Rule": ["flow", "config", "output", "condition"],
  "Value Generation Rule": ["config"],
  "Output Message Rule": ["output"],
  "Condition Rule": ["condition"],
  // 인텐트·엔티티 함수 규약(intent/intents/entity/entities/와일드카드). v0.8.1에서 조건을
  // NLP 기준으로 전환하며 연결했다 — condition 외 단계로 넓히면 다른 프롬프트가 오염된다.
  "NLP Function Reference": ["condition"],
}

export function stagesForCategory(category: string): RuleStage[] {
  return RULE_STAGE_BY_CATEGORY[category] || []
}

export function isValidCategory(c: string): boolean {
  return VALID_CATEGORIES.includes(c)
}

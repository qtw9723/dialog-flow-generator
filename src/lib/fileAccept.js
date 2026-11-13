// 파일 업로드 accept 목록 단일 소스.
//
// ⚠ 왜 한 곳인가: 같은 목록이 6곳에 복제돼 있었고 이미 갈라졌다(2026-09-28 실측).
//    ApiGenPage만 같은 집합을 다른 순서로 적고 있었다 — 복제가 따로 편집된 흔적이다.
//    복제 재발은 fileAccept.test.js가 정적으로 막는다.

/** 엑셀·CSV 전용 (ESD 시트, 데이터 변환) */
export const SPREADSHEET_ACCEPT = '.xlsx,.xls,.csv'

/** 시나리오 정의서 단일 업로드 (POC 문서 생성) */
export const SCENARIO_DOC_ACCEPT = '.docx,.xlsx,.pdf,.md,.txt'

/** 다중 파일 인입 (ESD·API·시나리오 혼재) */
export const MULTI_INGEST_ACCEPT = '.docx,.json,.yaml,.yml,.pdf,.xlsx,.xls,.csv,.md,.txt'

// 시나리오 카테고리(산업군) 목록 — **이 목록의 유일 소스**.
//
// 왜 `constants.js`가 아니라 별 모듈인가: `constants.js`는 최상단에서 `import.meta.env`를 읽는데
// Deno에는 `import.meta.env`가 없어 **모듈 로드 시점에 TypeError로 죽는다**(실측 확인).
// 엣지 함수(`scenario-assets/validate.ts`·`scenario-references/index.ts`)가 같은 목록을 써야 하므로
// `import.meta`를 전혀 쓰지 않는 이 파일에 목록을 두고, `constants.js`는 여기서 re-export한다
// (프론트의 이름 `SCENARIO_CATEGORIES`는 그대로 유지된다).
//
// ⚠ 목록을 늘리면 함께 고쳐야 하는 곳: 이 파일 +
// `supabase/migrations/20260910120000_create_scenario_assets_table.sql`의 CHECK 제약
// (SQL은 리터럴을 피할 수 없다) + `dialogflow_scenario_references`의 제약.
// 나머지(프론트 탭·두 엣지 함수 검증)는 이 파일에서 파생되므로 손대지 않는다.
export const SCENARIO_CATEGORIES = ['금융', '물류', '소매', '도매', '의료', '기타']

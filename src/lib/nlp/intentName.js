// 시나리오명 → 인텐트명 결정론 변환 — **이 규칙의 유일 소스**.
//
// 인텐트 = 시나리오 1:1이 확정된 모델이므로(2026-08-27) 이름을 LLM에게 맡길 이유가 없다.
// v0.8.0 실측에서 시나리오 "매장예약"에 LLM이 "예약하기"를 붙여, 조건에서 시나리오를
// 인텐트로 지목할 방법이 사라졌다. 이름을 여기서 고정해 그 대응을 코드로 보장한다.
//
// 프론트(`src/lib/assets/scenarioAssets.js`의 인텐트 귀속)와 엣지 함수
// (`supabase/functions/_shared/intentName.ts`) 양쪽이 **같은 규칙**을 써야 한다 —
// 한쪽만 바뀌면 귀속이 조용히 어긋난다. 그래서 정규식은 여기 한 벌만 두고
// `_shared/intentName.ts`는 이 파일을 import해 re-export한다(복제 금지).

// 인텐트명에 남길 문자: 한글(음절·자모)·영문·숫자만.
// 공백·구두점·기호는 전부 버린다(2026-08-28 사용자 지시) — 제공 샘플이 매장정보·프렌차이즈·FAQ처럼
// 특수문자 없는 이름이고, 슬래시 같은 문자를 솔루션 NLP가 받아주는지 확인되지 않았다.
// 밑줄도 버린다: 남겨두면 "예약_2"가 원본 이름인지 중복 접미사인지 구분할 수 없다.
const DISALLOWED = /[^0-9A-Za-z\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/g

/**
 * 시나리오명을 인텐트명으로. 허용 문자 외에는 모두 제거한다.
 * @param {string} scenarioName
 * @returns {string}
 */
export function intentNameOf(scenarioName) {
  return String(scenarioName ?? '').replace(DISALLOWED, '')
}

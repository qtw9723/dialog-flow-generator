// 확정 열 매핑에서 "사전에 새로 넣을 만한 용어"만 골라낸다 (순수 모듈).
//
// 이 입력은 일반 사용자가 만든 값이고 결과가 DB에 쓰인다. 넓게 받지 말 것.
// 위반은 던지지 않고 조용히 버린다 — 학습 실패가 생성을 막으면 안 된다.
import { MAPPABLE_FIELDS } from "../../../src/lib/pocDoc/termDictionary.ts"

const MAX_TERM_LEN = 40
// 필드당 누적 용어 상한. 넘으면 그 필드는 더 학습하지 않는다 — 프롬프트에 실리는
// [사용자 확정 열 매핑] 지침이 한없이 길어지면 토큰 비용과 지침 희석이 누적된다.
const MAX_TERMS_PER_FIELD = 30
// 한 요청에서 학습할 용어 수 상한. 넘는 만큼은 앞에서부터만 취하고 뒤는 버린다.
const MAX_LEARNABLE_PER_REQUEST = 20

// 제어문자·탭·줄바꿈을 막는다. 프롬프트 지침 한 줄을 깨뜨릴 수 있는 문자들이다.
// 문자 클래스는 반드시 이스케이프 표기(백슬래시 u 유니코드 이스케이프)로 쓴다
// — termDictionary.ts의 sanitize와 동일한 이유. new RegExp(문자열)로 감싼 것도 의도적이다:
// 정규식 리터럴로 직접 쓰면 저장 경로에 따라 이스케이프가 풀려(리터럴 제어 바이트로 저장되어)
// 하이픈 같은 정상 문자까지 범위 연산자에 휘말려 파괴되는 사고가 실제로 있었다.
// 수정 후에는 반드시 `grep -n "u0000" learnTerms.ts`와 `od -c`로 백슬래시가
// 문자 그대로(리터럴 제어 바이트가 아니라) 남아 있는지 확인할 것.
const CONTROL_OR_SEP = new RegExp("[\\u0000-\\u001F\\u007F]")
// 화면엔 안 보이지만 프롬프트 텍스트에 그대로 섞여 들어가는 폭없는/형식 문자들
// (NBSP, ZWSP~RLM, 워드조이너, BOM). 마찬가지로 new RegExp(문자열) 형태로 써서
// 이스케이프가 저장 경로에서 풀리지 않게 한다.
const INVISIBLE_CHARS = new RegExp("[\\u00A0\\u200B-\\u200F\\u2060\\uFEFF]")

export function validateLearnable(
  mapping: unknown,
  known: unknown,
): Array<{ field: string; term: string }> {
  if (!Array.isArray(mapping)) return []
  const seen = new Set<string>()
  // 필드별 누적 용어 수 — known(기존 사전)에서 시작해 이번 요청에서 채택할 때마다 늘린다.
  const fieldTermCount = new Map<string, number>()
  const loggedFieldCap = new Set<string>()
  if (Array.isArray(known)) {
    for (const e of known) {
      const f = (e as { field?: unknown })?.field
      const terms = (e as { terms?: unknown })?.terms
      if (typeof f !== "string" || !Array.isArray(terms)) continue
      fieldTermCount.set(f, (fieldTermCount.get(f) ?? 0) + terms.length)
      for (const t of terms) seen.add(`${f}::${String(t).trim().toLowerCase()}`)
    }
  }
  const out: Array<{ field: string; term: string }> = []
  for (const m of mapping) {
    if (out.length >= MAX_LEARNABLE_PER_REQUEST) {
      console.error("[poc-doc-parse] 요청당 학습 상한(", MAX_LEARNABLE_PER_REQUEST, ") 도달, 이후 후보는 무시합니다")
      break
    }
    const field = typeof (m as { field?: unknown })?.field === "string"
      ? (m as { field: string }).field : ""
    const term = typeof (m as { column?: unknown })?.column === "string"
      ? (m as { column: string }).column.trim() : ""
    if (!MAPPABLE_FIELDS.includes(field)) continue
    if (term === "" || term.length > MAX_TERM_LEN) continue
    if (CONTROL_OR_SEP.test(term) || INVISIBLE_CHARS.test(term)) continue
    const key = `${field}::${term.toLowerCase()}`
    if (seen.has(key)) continue
    const currentCount = fieldTermCount.get(field) ?? 0
    if (currentCount >= MAX_TERMS_PER_FIELD) {
      if (!loggedFieldCap.has(field)) {
        loggedFieldCap.add(field)
        console.error("[poc-doc-parse] 필드당 용어 상한(", MAX_TERMS_PER_FIELD, ") 도달, 학습 건너뜀:", field)
      }
      continue
    }
    seen.add(key)
    fieldTermCount.set(field, currentCount + 1)
    out.push({ field, term })
  }
  return out
}

/** 필드 하나에 실제로 쓸 최종 내용 — DB 쓰기 직전의 "계획"만 담는다. */
export interface LearnWrite {
  field: string
  /** 그 필드에 최종적으로 들어갈 전체 용어 배열(기존 + 신규). */
  terms: string[]
  /** 그중 사용자가 넣은 것만(어드민에서 출처 구분·삭제용). */
  userTerms: string[]
  /** DB content 컬럼에 그대로 쓸 최종 객체 — 기존 키(예: source)를 보존한다. */
  content: Record<string, unknown>
}

/** 쓰기 대상에서 제외된 필드 — 왜 빠졌는지를 index.ts가 로그로 남길 수 있게 사유를 들고 있다. */
export interface SkippedField {
  field: string
  /** 'no-row': 시드 행이 없어 쓸 대상 자체가 없음. 'field-cap': 필드당 용어 상한(30) 도달. */
  reason: "no-row" | "field-cap"
}

export interface LearnPlan {
  writes: LearnWrite[]
  skipped: SkippedField[]
}

// 확정된 학습 후보(validateLearnable의 결과)를 받아 "무엇을 쓸지"만 계산한다.
// DB를 건드리지 않고 console도 부르지 않는 순수 함수 — 로그는 index.ts가 skipped를
// 보고 남긴다(순수 함수 안에서 로그를 남기면 "무엇을 건너뛰었는지"가 함수 밖에서
// 재구성 불가능해져, 조용한 실패를 또 만들게 된다 — 실제로 2라운드에서 이 문제가 났었다).
//
// ⚠ entries가 배열이 아니거나 비어 있으면 writes·skipped 모두 빈 배열을 돌려준다.
// 이게 이 태스크의 핵심 가드다: 사전 읽기가 실패(또는 아직 비어있음)했는데도 학습을
// 진행하면, 아래에서 row를 못 찾아 신규 용어 하나짜리 content로 기존 시드 전체를
// 덮어써 버린다(Critical). 이 가드는 반드시 이 함수 안에 있어야 하고 반드시 단위
// 테스트로 고정돼야 한다 — index.ts(HTTP 핸들러) 안에 있으면 이 저장소의 테스트
// 스위트로는 회귀를 잡을 수 없다.
export function planLearnWrites(
  entries: unknown,
  learnable: Array<{ field: string; term: string }>,
): LearnPlan {
  if (!Array.isArray(entries) || entries.length === 0) return { writes: [], skipped: [] }
  if (!Array.isArray(learnable) || learnable.length === 0) return { writes: [], skipped: [] }

  // 필드별로 신규 용어를 모은다 — 필드당 쓰기 계획을 하나만 만들기 위함
  // (모으지 않으면 같은 필드에 신규 용어가 2개일 때 두 번째가 첫 번째를 덮어써 버린다).
  const byField = new Map<string, string[]>()
  for (const item of learnable) {
    const field = (item as { field?: unknown })?.field
    const term = (item as { term?: unknown })?.term
    if (typeof field !== "string" || typeof term !== "string") continue
    const list = byField.get(field) ?? []
    list.push(term)
    byField.set(field, list)
  }

  const writes: LearnWrite[] = []
  const skipped: SkippedField[] = []
  for (const [field, newTerms] of byField) {
    const row = (entries as Array<Record<string, unknown>>).find(
      (e) => e && typeof e === "object" && (e as { field?: unknown }).field === field,
    )
    // 시드 행이 없는 필드(예: 외부 연동)는 쓸 대상 자체가 없다 — 조용히 버리지 않고
    // 사유를 남겨서 index.ts가 로그로 드러낼 수 있게 한다.
    if (!row) {
      skipped.push({ field, reason: "no-row" })
      continue
    }
    const existingTerms = Array.isArray(row.terms) ? (row.terms as string[]) : []
    const existingUserTerms = Array.isArray(row.userTerms) ? (row.userTerms as string[]) : []
    // 이미 상한에 도달한 필드는 통째로 제외한다(부분만 잘라 쓰지 않는다).
    if (existingTerms.length >= MAX_TERMS_PER_FIELD) {
      skipped.push({ field, reason: "field-cap" })
      continue
    }
    const nextTerms = [...existingTerms, ...newTerms]
    const nextUserTerms = [...existingUserTerms, ...newTerms]
    // content를 통째로 교체하지 않고 기존 키(예: source)를 보존한 채 병합한다.
    const content = { ...row, terms: nextTerms, userTerms: nextUserTerms }
    writes.push({ field, terms: nextTerms, userTerms: nextUserTerms, content })
  }
  return { writes, skipped }
}

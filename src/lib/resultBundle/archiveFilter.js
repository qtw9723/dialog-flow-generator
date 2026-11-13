// 결과 목록의 보관 필터 (순수 — React·HTTP 없음).
//
// 화면이 아니라 여기에 두는 이유: 이 저장소에는 컴포넌트 테스트 하네스가 없다.
// 판정을 순수 함수로 빼야 테스트가 붙는다.
// `src/lib/results/`라는 새 디렉터리를 만들지 않는다 — resultBundle/과 이름이 겹쳐 헷갈린다.

import { rawErrorMessage } from '../errorMessage.js'

/** 필터 모드 3종. 화면의 칩과 1:1이고 순서가 칩 순서다. */
export const ARCHIVE_MODES = ['all', 'archived', 'unarchived']

/** 칩에 보일 한글 라벨. */
export const ARCHIVE_MODE_LABELS = {
  all: '전체',
  archived: '보관',
  unarchived: '미보관',
}

/**
 * 결과 하나가 보관 표시됐는지.
 * 키가 없던 옛 행은 readBundle의 기본값(false)으로 읽히므로 자연히 미보관이다.
 */
export const isArchived = (result) => result?.bundle?.archived === true

/**
 * 모드에 맞는 결과만 남긴다.
 * 모르는 모드는 'all'로 취급한다 — localStorage에 옛 값이 남아 있어도
 * 목록이 통째로 비어 보이면 안 된다.
 */
export function filterByArchive(results, mode) {
  const list = Array.isArray(results) ? results : []
  if (mode === 'archived') return list.filter(isArchived)
  if (mode === 'unarchived') return list.filter((r) => !isArchived(r))
  return list
}

/**
 * localStorage에 저장된 필터 모드를 검증한다.
 * ARCHIVE_MODES에 없는 값(옛 이름·손상값)은 'all'로 취급한다 —
 * filterByArchive는 이미 그렇게 관대하지만, 칩 하이라이트는 archiveMode === mode
 * 정확 일치라 모르는 값이 그대로 state에 들어가면 칩 3개가 전부 비활성으로 보인다.
 */
export function normalizeArchiveMode(mode) {
  return ARCHIVE_MODES.includes(mode) ? mode : 'all'
}

// admin-results(관리자 전용 함수)의 PATCH는 archived 분기가 없어(설계상 의도 —
// 관리자가 남의 결과를 표시하는 경로를 만들지 않는다) 마지막 폴백 400으로 떨어진다.
// 이 문자열이 바뀌면 여기도 같이 바꿔야 한다(admin-results/index.ts).
const ADMIN_RESULTS_PATCH_FALLBACK_MESSAGE = 'esd, or generated_json+edit_entry, or undo:true fields are required'

/**
 * 보관 토글 실패를 한국어 문구로 바꾼다(순수 함수 — React·HTTP 없음).
 *
 * "Unauthorized"(목록 경로: results의 인증 가드, 세션 없는 master 관리자)와
 * admin-results의 폴백 400(상세 경로: master 관리자가 admin-results를 부르는데
 * archived를 모름)은 원인이 같다 — 본인 소유가 아니거나(또는 사용자 세션이 없어)
 * 이 토글을 쓸 수 없는 계정이라는 것. 그래서 같은 안내로 합친다.
 * 그 밖의 오류는 서버 원문을 보여주고(디버깅용), 원문을 못 읽으면 일반 문구로 대체한다.
 */
export function archiveErrorMessage(error) {
  const raw = rawErrorMessage(error)

  if (raw === 'Unauthorized' || raw === ADMIN_RESULTS_PATCH_FALLBACK_MESSAGE) {
    return '본인이 만든 결과만 보관 표시할 수 있습니다.'
  }
  return raw || '보관 표시를 바꾸지 못했습니다.'
}

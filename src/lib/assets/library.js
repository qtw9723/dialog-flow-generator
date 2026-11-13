// 시나리오 라이브러리 목록의 병합·배지·오류 문구 (순수 — React·HTTP 없음).
//
// 화면이 아니라 여기에 두는 이유: 이 저장소에는 컴포넌트 테스트 하네스가 없다.
// 판정을 순수 함수로 빼야 테스트가 붙는다(항목 6의 archiveFilter.js와 같은 방식).

import { rawErrorMessage } from '../errorMessage.js'

/** 배지 3종. 키는 badgeOf의 반환값이다. */
export const ASSET_BADGES = {
  reference: '기반 자료',
  mine: '내 자산',
  team: '팀 자산',
}

/**
 * 배지 3종의 화면 스타일(테일윈드 클래스). ASSET_BADGES와 반드시 같은 키 집합을 유지한다 —
 * 한쪽만 늘면 화면에서 `BADGE_STYLE[새배지]`가 undefined가 되어 배지가 조용히 깨진다
 * (이 저장소의 반복된 실패 유형). 새 배지 종류를 추가할 땐 이 파일 안에서 두 맵을 같이 늘린다.
 */
export const ASSET_BADGE_STYLES = {
  reference: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  mine: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  team: 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]',
}

const email = (v) => String(v ?? '').trim().toLowerCase()

/**
 * 목록 행의 출처 배지.
 * ⚠ master 관리자는 Supabase 세션이 없어 userEmail이 null이다 — 그 화면에서는
 * 남의 것과 구분할 근거가 없으므로 전부 '팀 자산'으로 보인다(항목 6에서 실측된 제약).
 */
export function badgeOf(item, userEmail) {
  if (item?.kind !== 'asset') return 'reference'
  const me = email(userEmail)
  if (me && email(item?.owner_email) === me) return 'mine'
  return 'team'
}

/**
 * 기반 레퍼런스와 사용자 자산을 한 목록으로 합친다.
 * 기반 자료를 앞에 둔다 — 큐레이션된 것이 먼저 보이는 편이 고르기 쉽다.
 */
export function mergeLibraryItems(references, assets, userEmail) {
  const refs = (Array.isArray(references) ? references : []).map((r) => ({
    kind: 'reference',
    id: r.id,
    name: r.name,
    description: r.description || '',
    flow_json: r.flow_json,
    assets: null,          // 기반 레퍼런스에는 귀속 자산이 없다(출처 결과가 없다)
    owner_email: null,
  }))
  const own = (Array.isArray(assets) ? assets : []).map((a) => ({
    kind: 'asset',
    id: a.id,
    name: a.name,
    description: a.description || '',
    flow_json: a.flow_json,
    assets: a.assets || null,
    owner_email: a.owner_email || null,
  }))
  return [...refs, ...own].map((it) => ({ ...it, badge: badgeOf(it, userEmail) }))
}

/**
 * 자산 등록·삭제 실패를 한국어 문구로 바꾼다.
 * 항목 6의 archiveErrorMessage가 세운 방식 — 서버 원문 영어를 배너에 그대로 띄우지 않는다.
 */
export function assetErrorMessage(error) {
  const raw = rawErrorMessage(error)

  if (raw === 'Unauthorized') return '로그인한 계정에서만 자산을 등록·삭제할 수 있습니다.'
  if (raw === 'Forbidden') return '본인이 등록한 자산만 삭제할 수 있습니다.'
  // 아래 두 문구는 정보가 0인 문자열이라 번역한다(그 밖의 서버 원문은 의도적으로 그대로 통과시킨다 — 위 주석·아래 fallback 참고).
  // 'API request failed'는 src/hooks/useApi.js의 request()가 응답 바디에 message/error가
  // 둘 다 없을 때 지어내는 고정 문자열이다 — useApi의 그 fallback 문구가 바뀌면 이 매칭도 조용히 깨진다.
  if (raw === 'API request failed') return '요청이 실패했습니다. 잠시 후 다시 시도하거나, 해당 기능이 배포되어 있는지 확인해 주세요.'
  // 'Failed to fetch'는 브라우저가 네트워크 요청 자체가 안 될 때 fetch()가 던지는 고정 문자열이다.
  if (raw === 'Failed to fetch') return '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.'
  return raw || '자산 작업에 실패했습니다.'
}

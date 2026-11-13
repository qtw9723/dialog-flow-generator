// "직전으로 되돌리기"가 무엇을 되돌려야 하는지 판정한다(순수).
//
// 편집 패널에는 되돌릴 수 있는 층이 둘이다:
//   1. 미확정(pending) — 캔버스에서 방금 한 편집. 아직 저장 안 됨.
//   2. 확정 이력(history) — 서버 edit_history에 쌓인 지난 확정본.
// 사용자가 "직전"이라 부르는 건 화면에서 방금 한 일(1)이다. 미확정 편집이 떠 있는 동안
// 서버 이력(2)을 롤백하면, 사용자는 방금 한 편집을 취소한 줄 알면서 실제로는 무관한
// 과거 확정본을 잃는다(게다가 방금 한 편집은 캔버스에 그대로 남는다).
// 그래서 미확정 편집이 있으면 언제나 그쪽이 먼저다.

/**
 * @param {{hasPendingEdit?: boolean, hasHistory?: boolean}} o
 * @returns {'pending'|'history'|'none'}
 */
export function undoTarget({ hasPendingEdit = false, hasHistory = false } = {}) {
  if (hasPendingEdit) return 'pending'
  if (hasHistory) return 'history'
  return 'none'
}

// 소요 시간(ms) → 사람이 읽는 문자열 (순수).
//
// 값이 없거나 잘못된 값이면 **null**을 돌려준다 — 호출부는 null이면 그 줄을 아예 렌더하지
// 않는다. 기존 결과에는 duration_ms가 없으므로 "0초"를 보여주면 측정한 적 없는 것을
// 측정한 것처럼 만드는 거짓 표시가 된다.

/**
 * @param {number|string|null|undefined} ms
 * @returns {string|null} '1.2초' · '3초' · '1분 12초' · '1분' / 값이 없거나 유효하지 않으면 null
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || ms === '') return null
  const n = typeof ms === 'number' ? ms : Number(ms)
  if (!Number.isFinite(n) || n < 0) return null

  if (n < 60000) {
    // 1분 미만: 초 단위 소수 1자리. 정수로 떨어지면 소수점을 붙이지 않는다(3초 vs 3.0초).
    const sec = n / 1000
    const rounded = Math.round(sec * 10) / 10
    // 0에 가까운 값(1~99ms)은 0.1초로 올려 "0초"와 구분한다 — 측정은 됐다는 뜻.
    const shown = n > 0 && rounded === 0 ? 0.1 : rounded
    return `${Number.isInteger(shown) ? shown : shown.toFixed(1)}초`
  }

  const totalSec = Math.round(n / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return sec === 0 ? `${min}분` : `${min}분 ${sec}초`
}

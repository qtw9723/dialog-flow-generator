// 파일 자체에 대한 경고(내용 파싱 전·후) — 순수 모듈.
// 컴포넌트에 두면 테스트가 붙지 않는다(이 저장소에는 컴포넌트 테스트 하네스가 없다).

/** 이 크기를 넘으면 경고한다. 차단하지 않는다 — 터지는 건 파싱이 아니라 DOM이고, 그건 표시 상한이 막는다. */
export const SIZE_WARN_BYTES = 10 * 1024 * 1024

/**
 * 파일 크기와 데이터 행 수로 사용자에게 보일 경고를 만든다.
 * @param {{ size?: number, rowCount?: number }} input
 * @returns {string[]}
 */
export function fileWarnings({ size = 0, rowCount = 0 } = {}) {
  const out = []
  if (size > SIZE_WARN_BYTES) {
    out.push(`파일이 큽니다(${(size / 1024 / 1024).toFixed(1)}MB) — 비교는 되지만 표시는 일부만 됩니다.`)
  }
  if (rowCount === 0) out.push('데이터 행이 없습니다(헤더만 있는 파일).')
  return out
}

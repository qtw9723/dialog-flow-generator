// 던져진 오류에서 사람이 읽을 원문을 뽑는다 (순수).
//
// Error 객체·문자열·그 밖의 것(null·숫자·객체)을 모두 받아 문자열 아니면 null을 돌려준다.
// 도메인별 번역표는 각 소비처가 갖는다 — 여기는 추출만 한다.
// 한 벌로 두는 이유: 이 저장소는 같은 조각이 여러 벌로 갈라져 값이 어긋난 전례가 있다.
export function rawErrorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  if (typeof error === 'string') return error
  return null
}

// 결과 상세에 보일 "파생 실패 사유" 목록을 만든다 (순수 모듈).
//
// ⚠ 왜 순수 모듈인가: 이 저장소에는 컴포넌트 테스트 하네스가 없다. 어느 사유를 보일지·
//    무엇이라 부를지는 판단이므로 여기 두어야 테스트가 붙는다.
// ⚠ 왜 하나로 모으나: 항목 2가 nlp_error 전용 블록을 만들었는데, esd_error·api_error를
//    같은 모양으로 복붙하면 이 저장소가 반복해 다친 복제가 세 벌이 된다.

/** 사유 줄에 붙일 이름. 이 맵이 단일 소스다. */
export const DERIVATION_ERROR_LABELS = {
  nlp_error: 'NLP 학습 데이터',
  esd_error: 'ESD 스키마',
  api_error: 'API 정의',
}

// 표시 순서. 성공 키가 있으면 사유를 감출지 여부가 종류마다 다르다:
// NLP는 성공/실패가 배타적이지만(생산 측이 mergeBundle의 undefined 삭제로 상대를 지운다),
// ESD·API는 **일부만 실패**할 수 있어 성공 키가 있어도 사유를 보여야 한다.
const ORDER = [
  { key: 'nlp_error', successKey: 'nlp' },
  { key: 'esd_error', successKey: null },
  { key: 'api_error', successKey: null },
]

/**
 * @param {unknown} bundle 정규화된 result.bundle
 * @returns {Array<{key: string, label: string, reason: string}>}
 */
export function derivationErrors(bundle) {
  const b = bundle !== null && typeof bundle === 'object' ? bundle : {}
  const out = []
  for (const { key, successKey } of ORDER) {
    if (successKey && b[successKey]) continue
    const reason = String(b[key] ?? '').trim()
    if (reason === '') continue
    out.push({ key, label: DERIVATION_ERROR_LABELS[key], reason })
  }
  return out
}

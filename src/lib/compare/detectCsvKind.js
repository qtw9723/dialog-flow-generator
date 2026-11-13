// 헤더만 보고 우리 CSV 3종을 알아본다 (순수 모듈).
//
// 컬럼을 **인덱스**로 지목한다 — 엔티티 CSV는 빈 이름 헤더가 9개라 이름으로는 지목할 수 없다.

/** 화면 배지에 쓰는 한국어 이름. */
export const CSV_KIND_LABELS = {
  intents: '인텐트 학습 데이터',
  entities: '엔티티 학습 데이터',
  esd: 'ESD 업로드 데이터',
  unknown: '알 수 없는 CSV',
}

const norm = (h) => String(h ?? '').trim().toLowerCase()

const rangeFrom = (start, end) => {
  const out = []
  for (let i = start; i < end; i++) out.push(i)
  return out
}

const result = (kind, keyIndexes, setIndexes) => ({
  kind,
  label: CSV_KIND_LABELS[kind],
  keyIndexes,
  setIndexes,
})

/**
 * 헤더 배열에서 CSV 종류와 키·집합 컬럼 프리셋을 낸다.
 *
 * - intents: 키 = intent + example. 발화는 고치는 대상이 아니라 있거나 없는 것이라
 *   "변경"이 원리상 생기지 않는다(인텐트별 묶기는 화면의 일이다).
 * - entities: 키 = entity + value. 동의어는 위치로 들어가므로 **집합**으로 비교한다 —
 *   위치로 비교하면 순서만 바뀌어도 전부 변경으로 보인다.
 * - esd: createdAt·updatedAt 꼬리는 uploadCsvRules.js의 AUTO_APPEND_COLUMNS가 항상
 *   맨 끝에 붙이는 것이라 ESD 업로드 CSV의 유일한 고정 표식이다(앞쪽은 스키마마다 다르다).
 *
 * @param {string[]} headers
 * @returns {{ kind: 'intents'|'entities'|'esd'|'unknown', label: string, keyIndexes: number[], setIndexes: number[] }}
 */
export function detectCsvKind(headers) {
  const h = (headers ?? []).map(norm)

  if (h.length === 2 && h[0] === 'intent' && h[1] === 'example') {
    return result('intents', [0, 1], [])
  }

  if (h.length >= 4 && h[0] === 'entity' && h[1] === 'value' && h[2] === 'type' && h[3] === 'synonyms') {
    return result('entities', [0, 1], rangeFrom(3, h.length))
  }

  // 꼬리 두 칸을 빼고도 키로 쓸 컬럼이 남아야 한다.
  if (h.length >= 3 && h[h.length - 2] === 'createdat' && h[h.length - 1] === 'updatedat') {
    return result('esd', [0], [])
  }

  return result('unknown', h.length > 0 ? [0] : [], [])
}

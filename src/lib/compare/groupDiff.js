// 인텐트 CSV 차이를 화면에 보이기 좋게 묶는다 (순수 모듈).
//
// 인텐트 CSV는 키가 intent + example이라 "변경"이 원리상 없고 추가·삭제만 나온다.
// 평면 목록으로 보이면 같은 인텐트의 발화가 흩어져 읽기 어렵다 — 묶는 건 화면의 일이지
// diff 엔진의 일이 아니므로 엔진 밖에서 한다.
import { KEY_SEP } from './diffRows.js'

/** 키에서 인텐트(첫 키 컬럼)와 발화(두 번째)를 꺼낸다. */
function split(key) {
  const parts = String(key ?? '').split(KEY_SEP)
  return { intent: parts[0] ?? '', example: parts[1] ?? '' }
}

/**
 * @param {{added?: Array<{key: string}>, removed?: Array<{key: string}>}} diff
 * @returns {Array<{intent: string, added: string[], removed: string[]}>} 처음 나온 순서
 */
export function groupIntentDiff(diff) {
  const groups = new Map()
  const slot = (intent) => {
    if (!groups.has(intent)) groups.set(intent, { intent, added: [], removed: [] })
    return groups.get(intent)
  }

  for (const e of diff?.added ?? []) {
    const { intent, example } = split(e.key)
    slot(intent).added.push(example)
  }
  for (const e of diff?.removed ?? []) {
    const { intent, example } = split(e.key)
    slot(intent).removed.push(example)
  }

  return [...groups.values()]
}

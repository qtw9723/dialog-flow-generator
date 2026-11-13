// 키 기반 행 diff (순수 모듈).
//
// 종류별 차이는 전부 options(keyIndexes·setIndexes)로 들어온다 — 엔진 모양은 하나다.

/**
 * 키 컬럼 값을 잇는 구분자. 보이는 글자(`|`·`:` 등)를 쓰면 값 안에 그 글자가 있을 때
 * 서로 다른 두 행이 같은 키가 된다. CSV 셀에 NUL은 들어올 수 없다.
 */
export const KEY_SEP = '\u0000'

/**
 * 내부 키(NUL로 이어짐)를 사람이 읽는 형태로 바꾼다.
 * ⚠ CSV 내보내기와 화면이 **같은 함수**를 써야 한다 — 각자 split을 들고 있으면
 *    한쪽만 고쳐졌을 때 조용히 갈린다(이 저장소의 반복된 사고 유형).
 * @param {string} key
 * @returns {string}
 */
export function readableKey(key) {
  return String(key ?? '').split(KEY_SEP).join(' / ')
}

/**
 * 비교용 정규화. **기본은 원문 그대로**다 — 완화는 사용자가 켤 때만.
 * @param {unknown} value
 * @param {{ ignoreCase?: boolean, ignoreWhitespace?: boolean }} opts
 * @returns {string}
 */
export function normalizeValue(value, opts = {}) {
  let s = String(value ?? '')
  if (opts.ignoreWhitespace) s = s.trim().replace(/\s+/g, ' ')
  if (opts.ignoreCase) s = s.toLowerCase()
  return s
}

/**
 * before/after의 setIndexes를 합집합(중복 제거 + 오름차순)으로 합친다.
 * ⚠ 호출부(ComparePage.jsx)가 이 계산을 컴포넌트 안에 직접 들고 있다가, before의
 *    setIndexes만 넘기는 버그가 났던 자리다(after가 더 넓으면 늘어난 집합값이 새어
 *    나감). 판단이 들어간 계산이라 순수 함수로 빼서 테스트를 붙인다.
 * @param {number[]} [beforeIndexes]
 * @param {number[]} [afterIndexes]
 * @returns {number[]}
 */
export function unionSetIndexes(beforeIndexes, afterIndexes) {
  return [...new Set([...(beforeIndexes ?? []), ...(afterIndexes ?? [])])].sort((a, b) => a - b)
}

/**
 * 행에서 키를 만든다. 정규화를 키에도 셀과 **똑같이** 적용한다 —
 * 한쪽만 적용하면 "키는 같은데 셀이 다르다"는 유령 변경이 생긴다.
 * @param {string[]} row
 * @param {number[]} keyIndexes
 * @param {{ ignoreCase?: boolean, ignoreWhitespace?: boolean }} opts
 * @returns {string}
 */
export function buildKey(row, keyIndexes, opts = {}) {
  return keyIndexes.map((i) => normalizeValue(row[i], opts)).join(KEY_SEP)
}

/** 집합 컬럼 값을 `정규화값 → 원문` 맵으로 모은다. 빈 값은 padRow가 채운 자리이므로 버린다. */
function toSetMap(row, setIndexes, opts) {
  const m = new Map()
  for (const i of setIndexes) {
    const raw = row[i] ?? ''
    const n = normalizeValue(raw, opts)
    if (n === '') continue
    if (!m.has(n)) m.set(n, raw)
  }
  return m
}

/** 행 목록을 키 → 첫 행 맵으로 만든다. 중복 키는 경고로 보고한다. */
function indexRows(sideLabel, rows, keyIndexes, opts, warnings) {
  const map = new Map()
  const dup = new Map()
  for (const row of rows) {
    const key = buildKey(row, keyIndexes, opts)
    if (map.has(key)) { dup.set(key, (dup.get(key) ?? 1) + 1); continue }
    map.set(key, row)
  }
  for (const [key, count] of dup) {
    warnings.push(`${sideLabel}에 같은 키가 ${count}번 나옵니다 — 첫 행만 비교합니다: ${readableKey(key)}`)
  }
  return map
}

/**
 * 이름으로 짝지을 컬럼 맵(헤더 → 인덱스)을 만든다.
 * 키 컬럼과 집합 컬럼은 뺀다 — 키는 같아서 짝지어진 것이고, 집합은 범위 통째로 따로 다룬다.
 */
function namedColumns(sideLabel, headers, excluded, warnings) {
  const map = new Map()
  let counted = 0
  headers.forEach((h, i) => {
    if (excluded.has(i)) return
    counted++
    if (map.has(h)) return
    map.set(h, i)
  })
  if (map.size !== counted) {
    warnings.push(`${sideLabel}에 이름이 중복된 컬럼이 있습니다 — 먼저 나온 것만 비교합니다.`)
  }
  return map
}

/**
 * 두 표를 키로 맞춰 비교한다.
 * @param {{headers: string[], rows: string[][]}} before
 * @param {{headers: string[], rows: string[][]}} after
 * @param {{keyIndexes: number[], setIndexes?: number[], ignoreCase?: boolean, ignoreWhitespace?: boolean}} options
 */
export function diffRows(before, after, options) {
  const opts = {
    ignoreCase: !!options?.ignoreCase,
    ignoreWhitespace: !!options?.ignoreWhitespace,
  }
  const keyIndexes = options?.keyIndexes ?? [0]
  const setIndexes = options?.setIndexes ?? []
  const warnings = []

  const beforeMap = indexRows('왼쪽(이전)', before.rows, keyIndexes, opts, warnings)
  const afterMap = indexRows('오른쪽(이후)', after.rows, keyIndexes, opts, warnings)

  const excluded = new Set([...keyIndexes, ...setIndexes])
  const namedBefore = namedColumns('왼쪽(이전)', before.headers, excluded, warnings)
  const namedAfter = namedColumns('오른쪽(이후)', after.headers, excluded, warnings)

  const shared = [...namedBefore.keys()].filter((h) => namedAfter.has(h))
  const columnsAdded = [...namedAfter.keys()].filter((h) => !namedBefore.has(h))
  const columnsRemoved = [...namedBefore.keys()].filter((h) => !namedAfter.has(h))

  // 집합 컬럼의 대표 이름 = 범위 첫 헤더(엔티티는 'synonyms'). before가 비어 있으면
  // after 이름으로 대체한다 — before/after 헤더 길이가 다를 때 이 자리만 한쪽이 빈
  // 이름일 수 있다.
  const setHeader = setIndexes.length
    ? (before.headers[setIndexes[0]] || after.headers[setIndexes[0]] || '(집합)')
    : null

  const added = []
  for (const [key, row] of afterMap) if (!beforeMap.has(key)) added.push({ key, row })

  const removed = []
  for (const [key, row] of beforeMap) if (!afterMap.has(key)) removed.push({ key, row })

  const changed = []
  for (const [key, rowB] of beforeMap) {
    const rowA = afterMap.get(key)
    if (!rowA) continue

    const cells = []
    for (const header of shared) {
      const rawB = rowB[namedBefore.get(header)] ?? ''
      const rawA = rowA[namedAfter.get(header)] ?? ''
      if (normalizeValue(rawB, opts) !== normalizeValue(rawA, opts)) {
        cells.push({ header, before: rawB, after: rawA })
      }
    }

    const sets = []
    if (setIndexes.length) {
      const sb = toSetMap(rowB, setIndexes, opts)
      const sa = toSetMap(rowA, setIndexes, opts)
      const addedVals = [...sa.keys()].filter((k) => !sb.has(k)).map((k) => sa.get(k))
      const removedVals = [...sb.keys()].filter((k) => !sa.has(k)).map((k) => sb.get(k))
      if (addedVals.length || removedVals.length) {
        sets.push({
          header: setHeader,
          added: addedVals,
          removed: removedVals,
          beforeAll: [...sb.values()],
          afterAll: [...sa.values()],
        })
      }
    }

    if (cells.length || sets.length) changed.push({ key, before: rowB, after: rowA, cells, sets })
  }

  return { added, removed, changed, columnsAdded, columnsRemoved, warnings }
}

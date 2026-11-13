// 2열 그리드에서 한 줄 전체를 쓸 칸을 정한다(설문 질문 · 시나리오 필드 공용).
// 넓은 칸(isWide)은 항상 전체. 좁은 칸은 옆에 짝이 없을 때(다음 칸이 넓거나 마지막) 전체로 늘려 오른쪽 빈자리를 없앤다.
export function fullWidthFlags(items, isWide) {
  const flags = []
  let col = 0
  items.forEach((item, i) => {
    if (isWide(item)) { flags.push(true); col = 0; return }
    const next = items[i + 1]
    const alone = col === 0 && (next === undefined || isWide(next))
    flags.push(alone)
    col = alone ? 0 : (col + 1) % 2
  })
  return flags
}

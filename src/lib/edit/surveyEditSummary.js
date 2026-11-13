// 설문 응답 변경 요약 — 순수 함수. 부작용·IO 없음.

/**
 * 질문 목록 + 두 응답 맵을 비교해 사람이 읽는 한 줄 변경 요약을 반환한다.
 * @param {Array<{id: string, text?: string, label?: string}>} questions
 * @param {Record<string, any>} oldResponses - question.id 키 맵
 * @param {Record<string, any>} newResponses - question.id 키 맵
 * @returns {string}
 */
export function summarizeResponseChanges(questions, oldResponses, newResponses) {
  const old = oldResponses || {}
  const next = newResponses || {}
  const qs = Array.isArray(questions) ? questions : []

  // 결정론적 순서 보장
  const allKeys = [...new Set([...Object.keys(old), ...Object.keys(next)])].sort()

  const changed = []
  const added = []
  const removed = []

  for (const key of allKeys) {
    const hasOld = Object.prototype.hasOwnProperty.call(old, key)
    const hasNew = Object.prototype.hasOwnProperty.call(next, key)
    const label = getLabel(qs, key)

    if (hasOld && hasNew) {
      if (JSON.stringify(old[key]) !== JSON.stringify(next[key])) {
        changed.push(label)
      }
    } else if (hasOld) {
      removed.push(label)
    } else {
      added.push(label)
    }
  }

  if (changed.length === 0 && added.length === 0 && removed.length === 0) {
    return '변경 없음'
  }

  const parts = []
  if (changed.length > 0) parts.push(`수정: ${changed.join(', ')}`)
  if (added.length > 0) parts.push(`추가: ${added.join(', ')}`)
  if (removed.length > 0) parts.push(`삭제: ${removed.join(', ')}`)

  return `설문 수정 (${parts.join(' / ')})`
}

function getLabel(questions, id) {
  const q = questions.find((q) => q.id === id)
  return q?.text || q?.label || id
}

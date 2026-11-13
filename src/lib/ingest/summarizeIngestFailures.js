// 다중 파일 인입에서 일부 파일이 실패했을 때 사용자에게 보여줄 요약 (순수 함수).
//
// ⚠ 왜 필요한가: 예전에는 실패한 파일을 조용히 건너뛰었다
//    (NlScenarioFlow.jsx의 주석이 "실패한 파일은 건너뜀"이라고 직접 적고 있었다).
//    5개를 올렸는데 4개분만 반영된 결과가 아무 표시 없이 나왔다.

/**
 * @param {{name: string, reason: string}[]} failures
 * @param {number} total 올린 파일 총 개수
 * @returns {string|null} 실패가 없으면 null
 */
export function summarizeIngestFailures(failures, total) {
  const list = Array.isArray(failures) ? failures.filter((f) => f && f.name) : []
  if (list.length === 0) return null
  const lines = list.map((f) => {
    const reason = String(f.reason ?? '').trim()
    return reason ? `· ${f.name} — ${reason}` : `· ${f.name}`
  })
  return `${total}개 중 ${list.length}개를 읽지 못했습니다. 아래 파일은 결과에 반영되지 않았습니다.\n${lines.join('\n')}`
}

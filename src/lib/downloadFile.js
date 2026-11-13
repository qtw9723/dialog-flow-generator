// 브라우저 파일 다운로드 공용 헬퍼 (순수 DOM).
//
// 같은 8줄이 6개 컴포넌트에 복제돼 있었고 세부가 조금씩 달랐다 —
// appendChild/removeChild 유무, revoke 시점 등. Safari/Firefox는 문서에 붙지 않은 <a>의
// click을 무시할 수 있으므로 **append → click → remove**를 항상 거친다.
// revoke는 다음 틱으로 미룬다: 브라우저가 다운로드를 시작하기 전에 URL을 회수하면
// 빈 파일이 받아지는 경우가 있다.

/**
 * Blob을 파일로 내려받는다.
 * @param {string} filename 저장될 파일명
 * @param {Blob} blob
 */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 텍스트를 파일로 내려받는다.
 * @param {string} filename
 * @param {string} text
 * @param {string} [mime]
 */
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

/** JSON 객체를 보기 좋게(2칸 들여쓰기) 내려받는다. */
export function downloadJson(filename, obj) {
  downloadText(filename, JSON.stringify(obj, null, 2), 'application/json')
}

/** CSV 문자열을 내려받는다. BOM은 호출부가 이미 붙인 것을 그대로 쓴다(NLP CSV 규격). */
export function downloadCsv(filename, csv) {
  downloadText(filename, csv, 'text/csv;charset=utf-8')
}

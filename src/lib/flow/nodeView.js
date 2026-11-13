// 편집기가 없는 노드의 **읽기 전용 표시** (순수).
//
// 잠긴 노드도 "무슨 일을 하는 노드인지"는 보여야 한다. 원시 JSON을 던지면 읽기 어렵고,
// 타입마다 config 모양이 제각각이라 일일이 JSX를 짜면 분기가 불어난다.
// → **타입별 서술자**로 데이터 구동한다. 새 타입 추가 = 여기 한 줄.
//
// 서술자가 없는 타입은 호출부가 원시 JSON으로 폴백한다(정보를 감추지 않는다).

/** kind: 'text' 한 줄 · 'code' 여러 줄/코드 · 'pairs' key-value 목록 · 'list' 문자열 목록 */
const VIEWS = {
  docquery: [
    { key: 'input', label: '검색어로 쓰는 값' },
    { key: 'storeId', label: '문서 저장소 ID', note: '솔루션에 저장된 저장소를 가리킵니다' },
    { key: 'topn', label: '가져올 개수' },
    { key: 'score', label: '최소 유사도' },
    { key: 'filter', label: '필터', kind: 'code' },
    { key: 'result', label: '결과를 담을 변수', kind: 'pairs' },
  ],
  component: [
    { key: 'dialogId', label: '참조하는 컴포넌트 ID', note: '솔루션에 저장된 기능을 가리킵니다' },
    { key: 'params', label: '전달하는 값', kind: 'pairs' },
    { key: 'result', label: '받는 값', kind: 'pairs' },
  ],
  agent: [
    { key: 'counselor', label: '연결할 상담사' },
    { key: 'html', label: '안내 HTML', kind: 'code' },
  ],
  campaign: [
    { key: 'campaign', label: '캠페인 ID', note: '솔루션에 저장된 캠페인을 가리킵니다' },
    { key: 'projectId', label: '프로젝트 ID' },
    { key: 'type', label: '유형' },
    { key: 'result', label: '결과를 담을 변수', kind: 'pairs' },
  ],
  task: [
    { key: 'name', label: '작업 이름' },
    { key: 'exitConditions', label: '종료 조건', kind: 'conditions' },
  ],
  mail: [
    { key: 'receiver', label: '받는 사람' },
    { key: 'title', label: '제목' },
    { key: 'contentType', label: '형식' },
    { key: 'content', label: '내용', kind: 'code' },
  ],
  sms: [
    { key: 'receiver', label: '받는 번호' },
    { key: 'message', label: '내용', kind: 'code' },
    { key: 'attachment', label: '첨부' },
  ],
  shorturl: [
    { key: 'url', label: '원본 URL' },
    { key: 'params', label: '파라미터' },
    { key: 'result', label: '결과를 담을 변수', kind: 'pairs' },
  ],
  weather: [
    { key: 'items', label: '가져올 항목', kind: 'list' },
    { key: 'latitude', label: '위도' },
    { key: 'longitude', label: '경도' },
    { key: 'result', label: '결과를 담을 변수', kind: 'pairs' },
  ],
  auth: [
    { key: 'userKey', label: '사용자 키' },
    { key: 'secure', label: '보안 설정' },
  ],
}

const str = (v) => (v === null || v === undefined ? '' : String(v))

function renderValue(kind, raw) {
  if (kind === 'pairs') {
    const arr = Array.isArray(raw) ? raw : []
    return arr
      .map((it) => {
        const k = str(it?.key).trim()
        const v = str(it?.value).trim()
        return k ? (v ? `${k} = ${v}` : k) : ''
      })
      .filter(Boolean)
  }
  if (kind === 'list') {
    return (Array.isArray(raw) ? raw : []).map(str).filter(Boolean)
  }
  if (kind === 'conditions') {
    return (Array.isArray(raw) ? raw : [])
      .map((c) => {
        const cond = str(c?.condition).trim()
        const reason = str(c?.reason).trim()
        return cond ? (reason ? `${cond}  (${reason})` : cond) : ''
      })
      .filter(Boolean)
  }
  return str(raw).trim()
}

/**
 * 잠긴 노드를 읽기 좋게 보여줄 항목들.
 * @param {string} type 노드 타입
 * @param {object} config 노드 config
 * @returns {{fields: Array<{label:string, value:string|string[], kind:string, note?:string}>, hasView: boolean}}
 *   hasView=false면 서술자가 없는 타입 — 호출부가 원시 JSON으로 폴백한다.
 */
export function nodeViewFields(type, config) {
  const desc = VIEWS[typeof type === 'string' ? type : '']
  if (!desc) return { fields: [], hasView: false }
  // ⚠ 배열·클래스 인스턴스를 그대로 읽으면 **프로토타입 메서드가 값으로 잡힌다**
  //    (config가 []일 때 cfg['filter']가 Array.prototype.filter가 됐다 — 테스트가 잡음).
  //    평범한 객체만 받고, 자기 소유 키만 읽는다.
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  const own = (k) => (Object.prototype.hasOwnProperty.call(cfg, k) ? cfg[k] : undefined)
  const fields = []
  for (const d of desc) {
    const kind = d.kind || 'text'
    const value = renderValue(kind, own(d.key))
    // 빈 값은 숨긴다 — 안 쓰는 항목까지 나열하면 오히려 읽기 어렵다.
    if (Array.isArray(value) ? value.length === 0 : value === '') continue
    fields.push({ label: d.label, value, kind, ...(d.note ? { note: d.note } : {}) })
  }
  return { fields, hasView: true }
}

/** 서술자가 있는 타입 목록(테스트·점검용). */
export function viewableTypes() {
  return Object.keys(VIEWS).sort()
}

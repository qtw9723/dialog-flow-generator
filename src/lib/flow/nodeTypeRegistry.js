// 노드 타입 단일 소스 — 편집 가능 여부·에디터·표시 라벨.
//
// **화이트리스트다.** 여기 등록되지 않은 타입은 전부 편집 불가로 떨어진다.
// 이유(2026-08-28 실측): 실제 솔루션 봇의 **노드 타입은 21종**인데 그중 편집기를 가진 건
// 7종뿐이다(output·set·esd·api·llmchat·node·subflow). 나머지는 내용을 손댈 수 없다.
// 게다가 config 항목 자리에는 `type`이 표현식인 것도 있다 — `context.type ? context.type : "b" `.
// 따라서 "아는 것만 연다"가 유일하게 안전한 방향이다: 모르는 타입이 더 나와도 자동으로 잠긴다.
//
// ⚠ 이 맵에는 노드가 아닌 **config 항목 타입**(text·postback·html·carousel 등)도 라벨용으로
//    들어 있다. `component`·`task`처럼 양쪽으로 쓰이는 것이 있어 지우지 않는다. 조회는 노드
//    타입에만 쓰이므로 해가 없다. 커버리지 점검은 `scripts/node-type-coverage.ts`.
//
// 확장: 나중에 어떤 타입의 편집기를 만들면 여기 한 줄(+ 에디터 컴포넌트)만 추가한다.
// 다이어그램·노드 편집기·추가 팔레트가 모두 이 파일을 읽으므로 다른 곳은 건드리지 않는다.

/**
 * editable: 노드 내용을 편집할 수 있는가 (연결선 재연결·삭제는 editable과 무관하게 항상 가능)
 * editor:   NodeEditor가 렌더할 필드 세트 키 (editable일 때 필수)
 * label:    화면 표시용 이름
 * palette:  노드 추가 팔레트에 노출할지 (기본 true — editable인 것만 해당)
 */
export const NODE_TYPES = {
  // ── 생성기가 만들고 편집도 되는 것 ───────────────────────────────
  output:    { editable: true, editor: 'output',  label: '멘트' },
  set:       { editable: true, editor: 'set',     label: '변수 저장' },
  esd:       { editable: true, editor: 'esd',     label: '데이터 저장·조회' },
  api:       { editable: true, editor: 'api',     label: 'API 호출' },
  llmchat:   { editable: true, editor: 'llmchat', label: 'AI 자유응답' },
  input:     { editable: true, editor: 'set',     label: '입력' },
  node:      { editable: true, editor: 'branch',  label: '분기' },
  subflow: { editable: true, editor: 'loop',    label: '반복', palette: false },

  // ── 생성기가 만들지만 편집 대상이 아닌 것 ────────────────────────
  stack:        { editable: true, editor: 'stack', label: '화면 이동', palette: false },

  greeting:      { editable: false, label: '인사' },
  fallback: { editable: false, label: '그 외 응답' },
  text:         { editable: false, label: '텍스트' },
  openai:       { editable: false, label: 'OpenAI 호출' },
  create:       { editable: false, label: '데이터 생성' },
  // ── 열지 않는다 ①: **솔루션에 저장된 자원을 참조**하는 노드 (2026-08-28 사용자 확인)
  //    여기서 고치면 존재하지 않는 자원을 가리키게 만들 수 있고, 그건 다운로드해서 다시
  //    올리는 순간 봇을 깨뜨린다. **생성기는 참조 가능한 목록을 알 방법이 없어** 검증도 못 한다.
  //      component — 솔루션 저장 특수 기능(여러 노드의 묶음). config.dialogId가 그 참조
  //      docquery — 솔루션 저장 문서 저장소.               config.storeId가 그 참조
  //      agent     — 솔루션 저장 상담 연결 설정
  //      campaign  — 솔루션 저장 캠페인
  component:    { editable: false, label: '컴포넌트(솔루션 저장 기능)' },
  docquery:    { editable: false, label: '문서 검색(솔루션 저장 저장소)' },
  agent:        { editable: false, label: '상담사 연결(솔루션 저장 설정)' },
  campaign:     { editable: false, label: '캠페인(솔루션 저장)' },

  // ── 열지 않는다 ②: 편집할 내용이 없거나, 열 이유가 없는 노드
  //      group  — 기능이 없다. 화면 가시성을 위한 묶음일 뿐이라 **이름만 있으면 충분**하다.
  //               (이름은 잠긴 노드도 항상 편집된다 — 라벨 입력은 타입별 필드 바깥에 있다.)
  //      task   — 편집 대상에서 제외(2026-08-28 사용자 지시).
  //      greeting·fallback — 시나리오 밖 보일러플레이트.

  // ── 솔루션에만 있는 타입 — 라벨만 준다(다이어그램 가독성) ────────
  postback:       { editable: false, label: '버튼' },
  frame:          { editable: false, label: '프레임' },
  html:           { editable: false, label: 'HTML' },
  markdown:       { editable: false, label: '마크다운' },
  divider:        { editable: false, label: '구분선' },
  image:          { editable: false, label: '이미지' },
  carousel:       { editable: false, label: '캐러셀' },
  chart:          { editable: false, label: '차트' },
  link:           { editable: false, label: '링크' },
  numpad:         { editable: false, label: '숫자패드' },
  keypad:         { editable: false, label: '키패드' },
  locationpicker: { editable: false, label: '위치 선택' },
  map:            { editable: false, label: '지도' },
  clear:          { editable: false, label: '화면 지우기' },
  back:           { editable: false, label: '뒤로' },
  restore:        { editable: false, label: '복원' },
  group:        { editable: false, label: '그룹(화면 묶음)' },
  findone:        { editable: false, label: '데이터 단건 조회' },
  findall:        { editable: false, label: '데이터 목록 조회' },
  update:         { editable: false, label: '데이터 수정' },
  updateall:      { editable: false, label: '데이터 일괄 수정' },
  remove:         { editable: false, label: '데이터 삭제' },
  save:           { editable: false, label: '데이터 저장' },
  task:         { editable: false, label: '작업' },
  custom:         { editable: false, label: '커스텀' },
  auth:           { editable: false, label: '인증' },
  mail:           { editable: false, label: '메일 발송' },
  sms:            { editable: false, label: 'SMS 발송' },
  weather:        { editable: false, label: '날씨' },
  shorturl:       { editable: false, label: '단축 URL' },
}

const LOCKED = Object.freeze({ editable: false, editor: null })

/**
 * 타입 정보를 돌려준다. 등록되지 않은 타입·비문자열은 잠금으로 떨어진다.
 * @param {*} type
 * @returns {{editable: boolean, editor: string|null, label: string, palette: boolean}}
 */
export function nodeTypeInfo(type) {
  const key = typeof type === 'string' ? type : ''
  const hit = Object.prototype.hasOwnProperty.call(NODE_TYPES, key) ? NODE_TYPES[key] : null
  if (!hit) return { ...LOCKED, label: key || '알 수 없음', palette: false }
  return {
    editable: hit.editable === true,
    editor: hit.editable === true ? hit.editor : null,
    label: hit.label,
    palette: hit.editable === true && hit.palette !== false,
  }
}

/** nodeTypeInfo(type).editable 과 항상 같다. */
export function isEditableType(type) {
  return nodeTypeInfo(type).editable
}

/** 편집 가능한 타입 목록(정렬). */
export function editableTypes() {
  return Object.keys(NODE_TYPES).filter((t) => NODE_TYPES[t].editable === true).sort()
}

/** 노드 추가 팔레트에 노출할 타입 목록(정렬). */
export function paletteTypes() {
  return editableTypes().filter((t) => NODE_TYPES[t].palette !== false)
}

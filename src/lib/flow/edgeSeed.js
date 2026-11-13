import { conditionLabel } from '../refDiagram.js'

// 구조 엣지 → ReactFlow 엣지의 {type, data} 시드(순수 함수).
//
// 계약: 캔버스 엣지 `data.condition`이 조건의 소스 오브 트루스다.
//   - EdgeConditionEditor는 선택된 엣지의 `data.condition`으로 필드를 시드한다.
//   - canvasToFlow(step 6)는 `data.condition`이 undefined인 엣지를 건드리지 않아 원본 조건을 보존한다.
// 따라서 조건이 있으면 반드시 싣고(편집기가 기존 값을 보여줄 수 있게), 없으면 키 자체를 만들지 않는다
// (빈 문자열을 실으면 canvasToFlow가 타겟의 원본 조건을 지운다).

/**
 * @param {object} o
 * @param {string} o.condition   타겟 노드의 진입 조건식(구조 엣지의 condition)
 * @param {boolean} o.isBranch   출발 노드의 나가는 엣지가 2개 이상인가(=분기 라벨 대상)
 * @param {number} o.emptyCount  같은 분기 그룹에서 조건이 없는 갈래의 수. 정확히 1이면 그 갈래는
 *                               else(그 외)다 — findAmbiguousBranches가 허용하는 정상 패턴.
 *                               2 이상이면 어느 길인지 판단 불가(모호). 미지정(0)이면 보수적으로 모호 취급.
 * @param {boolean} o.turn       봇 응답 뒤 턴 경계인가(⏳ 응답 대기 배지)
 * @param {boolean} o.readOnly   읽기전용 뷰인가
 * @param {string} o.targetLabel 조건 없는 분기의 읽기전용 폴백 라벨(선택지 표시)
 * @returns {{type: string, data?: object}}
 */
export function seedEdgeVisual({ condition = '', isBranch = false, turn = false, readOnly = true, targetLabel = '', emptyCount = 0 } = {}) {
  const cond = String(condition || '').trim()

  // 분기 엣지 라벨 = 실제 진입 조건(conditionLabel로 친화 표기). 조건이 없으면:
  //   유일한 무조건 갈래 → '그 외'(else). 형제 조건이 하나도 안 맞을 때 타는 길이므로,
  //     목적지 라벨을 넣으면 "이 조건일 때 간다"처럼 읽혀 의미가 뒤집힌다.
  //   무조건 갈래가 2개+ → 모호. 읽기전용은 목적지 라벨로 폴백(선택지 표시),
  //     편집은 '⚠ 조건 없음'(조건을 넣어야 함을 명시).
  const branch = !isBranch ? null
    : cond ? { label: conditionLabel(cond), warn: false }
    : emptyCount === 1 ? { label: '그 외', warn: false }
    : readOnly ? { label: conditionLabel('', targetLabel), warn: false }
    : { label: '⚠ 조건 없음', warn: true }

  const wait = turn && !branch
  const type = wait ? 'waitEdge' : (branch?.label ? 'branchEdge' : 'smoothstep')

  const data = {}
  if (branch?.label) { data.label = branch.label; data.warn = !!branch.warn }
  if (cond) data.condition = cond

  return Object.keys(data).length ? { type, data } : { type }
}

// 구조 다이어그램: 노드 타입 → 표준 플로우차트 도형 매핑 (순수 함수, UI 무관).
// refDiagram이 내보내는 node.type 값을 도형 키로 변환한다.
//   rounded=둥근 사각형(안내)  parallelogram=평행사변형(입력)  diamond=마름모(분기)
//   rect=사각형(저장)  double=이중테두리(반복)  hexagon=육각형(API)
//   cylinder=원통/DB(기록 저장)  ai=사각형+별표(AI 응답)

export const NODE_SHAPES = [
  'rounded', 'parallelogram', 'diamond', 'rect', 'double', 'hexagon', 'cylinder', 'ai',
]

export function shapeForType(type) {
  switch (type) {
    case 'output': return 'rounded'
    case 'input': return 'parallelogram'
    case 'node':
    case 'condition': return 'diamond'
    case 'set': return 'rect'
    case 'subflow': return 'double'
    case 'api': return 'hexagon'
    case 'esd': return 'cylinder'
    case 'llmchat': return 'ai'
    default: return 'rect'
  }
}

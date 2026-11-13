// designFlow LLM 출력 = 추상 노드 그래프 (중간 표현)
export interface FlowNode {
  id: string            // 플로우 내 고유 id
  type: string          // 노드 카탈로그의 노드 종류명
  intent: string        // 자연어 의도 (expandFlowWithSpecs 값 채우기 힌트)
  next: string[]        // 다음 노드 id들 (분기면 복수, 종결이면 빈 배열)
  variants?: string[]   // 판별 유니온 노드(예: output)에서 포함할 item type들 (예: ["text","image"]). 없으면 기본 1개.
  scenarioName?: string // 시나리오 진입 노드에만: 이 시나리오의 이름. FlowSpec(중간 표현) 전용 —
                        // generated_json에는 절대 싣지 않는다(솔루션 임포터가 미지 필드를 거부).
                        // generation_tiers.scenarios로만 흐른다.
  loop?: {              // type==="loop"일 때만: 반복 루프(subflow) 의도
    body: string[]      // 반복 본문 진입 노드 id(들)
    exitVar: string     // 탈출 flag 변수(본문 set 노드가 true로 만드는 그 변수)
    max?: number        // 안전 최대 반복(미지정 시 코드 기본값)
  }
}

export interface FlowSpec {
  version: string       // "1"
  entry: string         // 시작 노드 id
  nodes: FlowNode[]
}

export interface NodeCatalogEntry {
  type: string                 // 머신 노드 타입 = features.reference_path 마지막 세그먼트 (예: "output", "condition", "api")
  label: string                // 사람용 라벨 = features.name (한/영 혼재; 프롬프트 힌트용)
  description: string
  promptInstruction: string    // features.prompt_instruction
  isTerminal: boolean          // 종결 가능 노드인지 (type이 output/agent)
  variantTypes?: string[]      // 이 노드가 가진 판별 유니온 item type 선택지 (예: output → text/image/carousel…)
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

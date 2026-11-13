// 노드 스펙: 예시 골격 + 채울 슬롯
export interface SlotSpec {
  path: string                 // 예: "config.items[].type", "config.waitInput"
  kind: string                 // "string" | "enum" | "boolean" | "number" | "array<string>" | "auto-id" 등
  options?: string[]           // enum 허용값 (레퍼런스 실제값으로 한정)
  required?: boolean
  default?: unknown
  source?: string              // 값 출처: "intent" | "response" | "user-input" | "auto-id" | "fixed" | "system"
  note?: string                // 이 자리를 채울 때 지켜야 할 규칙(설명에서 도출)
  // kind === "array<variant>" 판별 유니온 배열용
  discriminator?: string                                    // 보통 "type"
  variants?: Record<string, { example?: unknown; slots?: SlotSpec[] }>
}
export interface NodeSpec {
  type: string
  summary: string
  isTerminal: boolean
  example: unknown             // 레퍼런스에서 온 실제 노드 골격(템플릿)
  slots: SlotSpec[]
}

// 결정론적 추출 결과
export interface ExtractedField {
  values: unknown[]            // 등장한 원시값 집합(중복 제거)
  types: string[]              // 등장한 JS 타입들
}
// 판별 유니온 배열(예: output.config.items[], item.type별로 모양이 다름)의 variant별 하위 스키마
export interface VariantSchema {
  fields: Record<string, ExtractedField>
  arrays?: Record<string, DiscriminatedArray>   // 중첩 판별 배열
  example: unknown
}
export interface DiscriminatedArray {
  discriminator: string                          // 판별 키 (보통 "type")
  variants: Record<string, VariantSchema>        // 판별값 → 하위 스키마
}

export interface ExtractedType {
  fields: Record<string, ExtractedField>   // path → 값/타입 (판별 배열 내부는 제외)
  arrays?: Record<string, DiscriminatedArray>   // 판별 유니온 배열 path → variant 스키마
  example: unknown                          // 대표 인스턴스 1개
  count: number
  description: string                       // 레퍼런스 노드의 description(가장 풍부한 것) — LLM 일반화 입력
}
export type ExtractResult = Record<string, ExtractedType>

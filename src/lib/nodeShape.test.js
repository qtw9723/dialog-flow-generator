import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { shapeForType, NODE_SHAPES } from "./nodeShape.js"

Deno.test('shapeForType: 8종 노드 타입 → 표준 플로우차트 도형', () => {
  assertEquals(shapeForType('output'), 'rounded')       // 안내
  assertEquals(shapeForType('input'), 'parallelogram')  // 입력
  assertEquals(shapeForType('node'), 'diamond')         // 분기
  assertEquals(shapeForType('condition'), 'diamond')    // 분기
  assertEquals(shapeForType('set'), 'rect')             // 저장
  assertEquals(shapeForType('subflow'), 'double')     // 반복
  assertEquals(shapeForType('api'), 'hexagon')          // API 연동
  assertEquals(shapeForType('esd'), 'cylinder')         // 기록 저장
  assertEquals(shapeForType('llmchat'), 'ai')           // AI 응답
})

Deno.test('shapeForType: 미지의 타입은 사각형으로 폴백', () => {
  assertEquals(shapeForType('greeting'), 'rect')
  assertEquals(shapeForType(undefined), 'rect')
  assertEquals(shapeForType(''), 'rect')
})

Deno.test('반환 도형은 모두 알려진 도형 집합에 속한다', () => {
  for (const t of ['output', 'input', 'node', 'condition', 'set', 'subflow', 'api', 'esd', 'llmchat', 'zzz']) {
    assertEquals(NODE_SHAPES.includes(shapeForType(t)), true)
  }
})

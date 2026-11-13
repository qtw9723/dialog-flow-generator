import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { scanColumns } from './scanColumns.ts'

Deno.test('표 하나의 헤더와 행 수를 뽑는다', () => {
  const text = '=== 표 1 ===\n시나리오\t진입발화\n배송조회\t배송 알려줘\n주문취소\t취소할래'
  assertEquals(scanColumns(text), [
    { name: '표 1', headerRow: ['시나리오', '진입발화'], rowCount: 2 },
  ])
})

Deno.test('표가 여러 개면 순서대로', () => {
  const text = '=== A ===\nh1\tv1\n=== B ===\nx\ty\n1\t2'
  const out = scanColumns(text)
  assertEquals(out.length, 2)
  assertEquals(out[0], { name: 'A', headerRow: ['h1', 'v1'], rowCount: 0 })
  assertEquals(out[1].name, 'B')
  assertEquals(out[1].rowCount, 1)
})

Deno.test('표 블록이 없으면 빈 배열 — 서술형 문서', () => {
  assertEquals(scanColumns('그냥 줄글로 쓴 정의서입니다.\n두 번째 줄.'), [])
})

Deno.test('헤더 앞 빈 줄을 건너뛴다', () => {
  assertEquals(scanColumns('=== S ===\n\n\nA\tB\n1\t2')[0].headerRow, ['A', 'B'])
})

Deno.test('셀의 앞뒤 공백을 다듬는다', () => {
  assertEquals(scanColumns('=== S ===\n  A  \t B \n1\t2')[0].headerRow, ['A', 'B'])
})

Deno.test('한 칸짜리 표도 헤더로 인정한다', () => {
  assertEquals(scanColumns('=== S ===\n기능명\n조회')[0].headerRow, ['기능명'])
})

Deno.test('빈 입력과 null도 던지지 않는다', () => {
  assertEquals(scanColumns(''), [])
  assertEquals(scanColumns(null), [])
})

Deno.test('머리글만 있고 내용이 없는 블록은 결과에 안 들어간다', () => {
  assertEquals(scanColumns('=== 빈표 ==='), [])
})

Deno.test('블록 안에 빈 줄만 있어도 안 들어간다', () => {
  assertEquals(scanColumns('=== 빈표 ===\n\n\n'), [])
})

Deno.test('빈 블록이 중간에 끼어도 뒤의 정상 표는 그대로 나온다', () => {
  const out = scanColumns('=== 빈표 ===\n=== S ===\nA\tB\n1\t2')
  assertEquals(out.length, 1)
  assertEquals(out[0].name, 'S')
  assertEquals(out[0].headerRow, ['A', 'B'])
})

Deno.test('제목 행이 있으면 그다음 행이 헤더가 된다', () => {
  const text = '=== S ===\n배송 시나리오\n시나리오\t진입발화\t수집정보\n배송조회\t배송 알려줘\t송장번호'
  const out = scanColumns(text)
  assertEquals(out[0].headerRow, ['시나리오', '진입발화', '수집정보'])
})

Deno.test('제목 행이 있을 때 rowCount는 1이다', () => {
  const text = '=== S ===\n배송 시나리오\n시나리오\t진입발화\t수집정보\n배송조회\t배송 알려줘\t송장번호'
  const out = scanColumns(text)
  assertEquals(out[0].rowCount, 1)
})

Deno.test('제목 행이 있을 때 title이 설정된다', () => {
  const text = '=== S ===\n배송 시나리오\n시나리오\t진입발화\t수집정보\n배송조회\t배송 알려줘\t송장번호'
  const out = scanColumns(text)
  assertEquals(out[0].title, '배송 시나리오')
})

Deno.test('한 칸짜리 표은 여전히 헤더로 남는다', () => {
  const out = scanColumns('=== S ===\n기능명\n조회')
  assertEquals(out[0].headerRow, ['기능명'])
  assertEquals(out[0].title, undefined)
})

Deno.test('제목 행만 있으면 그것이 헤더가 된다', () => {
  const out = scanColumns('=== S ===\n배송 시나리오')
  assertEquals(out[0].headerRow, ['배송 시나리오'])
  assertEquals(out[0].title, undefined)
})

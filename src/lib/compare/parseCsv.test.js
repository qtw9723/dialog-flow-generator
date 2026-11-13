import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { parseCsv, normalizeText, detectDelimiter } from './parseCsv.js'

Deno.test('normalizeText: CRLF·CR을 LF로 접고 맨 앞 BOM만 없앤다', () => {
  assertEquals(normalizeText('﻿a\r\nb\rc'), 'a\nb\nc')
  // 중간의 U+FEFF는 값의 일부일 수 있으므로 건드리지 않는다
  assertEquals(normalizeText('a﻿b'), 'a﻿b')
})

Deno.test('detectDelimiter: 따옴표 밖에서 가장 많이 나온 후보를 고른다', () => {
  assertEquals(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t')
  assertEquals(detectDelimiter('a,b,c\n1,2,3'), ',')
  // 따옴표 안의 탭은 세지 않는다 — 쉼표 CSV가 탭으로 오판되면 전체가 한 칸이 된다
  assertEquals(detectDelimiter('a,b\n"x\t\t\t\t\ty",2'), ',')
  // 후보가 하나도 없으면 쉼표
  assertEquals(detectDelimiter('onlyonecolumn\nvalue'), ',')
})

Deno.test('parseCsv: 따옴표 안의 구분자와 개행은 값의 일부다', () => {
  const { headers, rows } = parseCsv('a,b\n"x,y","z\nw"')
  assertEquals(headers, ['a', 'b'])
  assertEquals(rows, [['x,y', 'z\nw']])
})

Deno.test('parseCsv: 따옴표 안의 ""는 따옴표 한 글자다', () => {
  const { rows } = parseCsv('a\n"he said ""hi"""')
  assertEquals(rows, [['he said "hi"']])
})

Deno.test('parseCsv: 빈 따옴표 필드는 빈 문자열이다', () => {
  const { rows } = parseCsv('a,b\n"",x')
  assertEquals(rows, [['', 'x']])
})

Deno.test('parseCsv: 감싸지 않은 필드는 트림하지 않는다 (확정 사항 3 — 원문 그대로)', () => {
  const { rows } = parseCsv('a,b\n  x  , y')
  assertEquals(rows, [['  x  ', ' y']])
})

Deno.test('parseCsv: 헤더보다 짧은 행은 빈 문자열로 채운다', () => {
  const { rows, warnings } = parseCsv('a,b,c\n1,2')
  assertEquals(rows, [['1', '2', '']])
  assertEquals(warnings, [])
})

Deno.test('parseCsv: 헤더보다 긴 행은 그대로 두고 경고한다', () => {
  const { rows, warnings } = parseCsv('a,b\n1,2,3')
  assertEquals(rows, [['1', '2', '3']])
  assertEquals(warnings.length, 1)
  assertEquals(warnings[0].includes('2행'), true)
})

// ── Minor 6 회귀 — 긴 행 경고의 "N행"은 idx+2(빈 줄 제거·따옴표 개행을 반영하지
//    않은 레코드 인덱스)가 아니라 실제 물리 줄 번호여야 한다.

Deno.test('parseCsv: 따옴표 안 개행이 있어도 긴 행 경고가 실제 물리 줄 번호를 쓴다', () => {
  const { rows, warnings } = parseCsv('a,b\n"x\ny",2\n1,2,3')
  assertEquals(rows, [['x\ny', '2'], ['1', '2', '3']])
  assertEquals(warnings.length, 1)
  // 물리적으로 1행 헤더, 2~3행이 따옴표 안 개행으로 한 레코드, 4행이 긴 행 — "4행"이어야 한다.
  // (idx+2로 계산하면 레코드 인덱스 기준 "3행"이 되어 틀린다.)
  assertEquals(warnings[0].includes('4행'), true)
})

Deno.test('parseCsv: 빈 줄을 건너뛰어도 긴 행 경고가 실제 물리 줄 번호를 쓴다', () => {
  const { rows, warnings } = parseCsv('a,b\n\n\n1,2,3')
  assertEquals(rows, [['1', '2', '3']])
  assertEquals(warnings.length, 1)
  // 물리적으로 1행 헤더, 2·3행이 빈 줄(제거됨), 4행이 긴 행 — "4행"이어야 한다.
  // (idx+2로 계산하면 빈 줄이 걸러진 뒤의 레코드 인덱스 기준 "2행"이 되어 틀린다.)
  assertEquals(warnings[0].includes('4행'), true)
})

Deno.test('parseCsv: 빈 줄은 유령 행을 만들지 않는다', () => {
  const { rows } = parseCsv('a,b\n1,2\n\n3,4\n')
  assertEquals(rows, [['1', '2'], ['3', '4']])
})

Deno.test('parseCsv: 전부 빈 칸인 행은 빈 줄이 아니므로 살린다', () => {
  const { rows } = parseCsv('a,b,c\n,,')
  assertEquals(rows, [['', '', '']])
})

Deno.test('parseCsv: 닫히지 않은 따옴표는 던지지 않고 줄 번호를 경고한다', () => {
  const { rows, warnings } = parseCsv('a,b\n1,"열린채로\n계속')
  assertEquals(rows, [['1', '열린채로\n계속']])
  assertEquals(warnings.length, 1)
  assertEquals(warnings[0].includes('2행'), true)
})

Deno.test('parseCsv: 빈 입력은 빈 결과다', () => {
  assertEquals(parseCsv(''), { headers: [], rows: [], delimiter: ',', warnings: [] })
})

Deno.test('parseCsv: 헤더만 있는 파일은 행이 0이다', () => {
  const { headers, rows } = parseCsv('a,b\n')
  assertEquals(headers, ['a', 'b'])
  assertEquals(rows, [])
})

// ── 실측 회귀 — 이 설계의 근거가 "기존 파서는 이 파일들을 망가뜨린다"이므로,
//    새 파서가 그 파일들을 망가뜨리지 않는다는 증거가 있어야 한다.

Deno.test('실측: sample-entities.csv는 13컬럼 그대로 읽힌다 (빈 열을 지우지 않는다)', async () => {
  const text = await Deno.readTextFile('docs/superpowers/fixtures/sample-entities.csv')
  const { headers, rows } = parseCsv(text)
  assertEquals(headers.length, 13)
  assertEquals(headers.slice(0, 4), ['entity', 'value', 'type', 'synonyms'])
  assertEquals(headers.slice(4), ['', '', '', '', '', '', '', '', ''])
  for (const row of rows) assertEquals(row.length, 13)
})

Deno.test('실측: sample-intents.csv는 BOM이 벗겨지고 헤더가 intent·example이다', async () => {
  const text = await Deno.readTextFile('docs/superpowers/fixtures/sample-intents.csv')
  const { headers, rows } = parseCsv(text)
  assertEquals(headers, ['intent', 'example'])
  assertEquals(rows[0], ['매장예약', '예약해줘'])
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { diffToCsv, diffCsvFilename, DIFF_CSV_HEADER } from './diffToCsv.js'
import { KEY_SEP } from './diffRows.js'

const lines = (csv) => csv.replace(/^﻿/, '').split('\n')

Deno.test('BOM으로 시작한다 — 엑셀에서 한글이 깨지지 않으려면 필요하다', () => {
  const csv = diffToCsv({ added: [], removed: [], changed: [] })
  assertEquals(csv.charCodeAt(0), 0xfeff)
})

Deno.test('헤더는 구분·키·컬럼·이전·이후다', () => {
  assertEquals(DIFF_CSV_HEADER, ['구분', '키', '컬럼', '이전', '이후'])
  assertEquals(lines(diffToCsv({ added: [], removed: [], changed: [] }))[0],
    '"구분","키","컬럼","이전","이후"')
})

Deno.test('추가는 이후 칸에 행 전체가 들어간다', () => {
  const csv = diffToCsv({ added: [{ key: '3', row: ['3', 'z'] }], removed: [], changed: [] })
  assertEquals(lines(csv)[1], '"추가","3","(행 전체)","","3 | z"')
})

Deno.test('삭제는 이전 칸에 행 전체가 들어간다', () => {
  const csv = diffToCsv({ added: [], removed: [{ key: '2', row: ['2', 'y'] }], changed: [] })
  assertEquals(lines(csv)[1], '"삭제","2","(행 전체)","2 | y",""')
})

Deno.test('변경 셀은 한 줄씩 나온다', () => {
  const csv = diffToCsv({
    added: [], removed: [],
    changed: [{ key: '1', cells: [{ header: 'v', before: 'x', after: 'X' }], sets: [] }],
  })
  assertEquals(lines(csv)[1], '"변경","1","v","x","X"')
})

Deno.test('집합 변경은 추가·삭제분이 아니라 집합 전체를 낸다', () => {
  const csv = diffToCsv({
    added: [], removed: [],
    changed: [{
      key: '정보 / 연락처', cells: [],
      sets: [{ header: 'synonyms', added: ['유선'], removed: ['번호'], beforeAll: ['전화', '번호'], afterAll: ['전화', '유선'] }],
    }],
  })
  assertEquals(lines(csv)[1], '"변경","정보 / 연락처","synonyms","전화, 번호","전화, 유선"')
})

Deno.test('NUL로 이어진 키는 사람이 읽는 구분자로 바꾼다', () => {
  const csv = diffToCsv({ added: [{ key: `정보${KEY_SEP}연락처`, row: ['정보', '연락처'] }], removed: [], changed: [] })
  assertEquals(lines(csv)[1].includes('"정보 / 연락처"'), true)
  assertEquals(csv.includes(KEY_SEP), false)
})

Deno.test('따옴표·쉼표·개행이 든 값도 깨지지 않는다', () => {
  const csv = diffToCsv({
    added: [], removed: [],
    changed: [{ key: '1', cells: [{ header: 'v', before: 'a"b,c', after: 'd\ne' }], sets: [] }],
  })
  assertEquals(csv.includes('"a""b,c"'), true)
  assertEquals(csv.includes('"d\ne"'), true)
})

Deno.test('diffCsvFilename: 종류와 날짜가 들어간다', () => {
  assertEquals(diffCsvFilename('intents', new Date(2026, 8, 14)), '비교-인텐트-20260914.csv')
  assertEquals(diffCsvFilename('entities', new Date(2026, 8, 14)), '비교-엔티티-20260914.csv')
  assertEquals(diffCsvFilename('esd', new Date(2026, 8, 14)), '비교-ESD-20260914.csv')
  assertEquals(diffCsvFilename('unknown', new Date(2026, 11, 1)), '비교-CSV-20261201.csv')
})

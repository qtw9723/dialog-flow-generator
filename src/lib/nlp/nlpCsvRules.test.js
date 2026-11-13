import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { BOM, DELIMITER, LINE_ENDING, ENTITY_COLUMN_COUNT, INTENT_HEADER, ENTITY_HEADER_NAMED, quoteCell, padRow } from "./nlpCsvRules.js"

// 규격은 사용자 제공 샘플 실측값이다. ESD 업로드 CSV(BOM 없음)와 반대이므로 상수를 공유하지 않는다.

Deno.test("규격 상수 — 샘플 실측값", () => {
  assertEquals(BOM, '﻿')
  assertEquals(DELIMITER, ',')
  assertEquals(LINE_ENDING, '\n')      // CRLF 아님
  assertEquals(ENTITY_COLUMN_COUNT, 13)
  assertEquals(INTENT_HEADER, ['intent', 'example'])
  assertEquals(ENTITY_HEADER_NAMED, ['entity', 'value', 'type', 'synonyms'])
})

Deno.test("quoteCell — 전 셀을 항상 인용한다(샘플이 그렇다)", () => {
  assertEquals(quoteCell('예약해줘'), '"예약해줘"')
  assertEquals(quoteCell(''), '""')
})

Deno.test("quoteCell — 내부 따옴표는 두 번으로 이스케이프", () => {
  assertEquals(quoteCell('그는 "예약"이라 했다'), '"그는 ""예약""이라 했다"')
})

Deno.test("quoteCell — 쉼표·개행이 있어도 인용으로 안전하다", () => {
  assertEquals(quoteCell('a,b'), '"a,b"')
  assertEquals(quoteCell('a\nb'), '"a\nb"')
})

Deno.test("quoteCell — 숫자·null·undefined도 문자열로", () => {
  assertEquals(quoteCell(0), '"0"')
  assertEquals(quoteCell(null), '""')
  assertEquals(quoteCell(undefined), '""')
})

Deno.test("padRow — 부족하면 빈 문자열로 채운다", () => {
  assertEquals(padRow(['a', 'b'], 5), ['a', 'b', '', '', ''])
})

Deno.test("padRow — 넘치면 잘라낸다(솔루션 컬럼 수가 고정)", () => {
  assertEquals(padRow(['a', 'b', 'c'], 2), ['a', 'b'])
})

Deno.test("padRow — 정확히 맞으면 그대로", () => {
  assertEquals(padRow(['a', 'b'], 2), ['a', 'b'])
})

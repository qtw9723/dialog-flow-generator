import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { toIntentsCsv, toEntitiesCsv } from "./toNlpCsv.js"

const bundle = {
  intents: [
    { name: '배송조회', examples: ['언제 와요', '배송 어디까지 왔어요'] },
    { name: '주문취소', examples: ['취소할래'] },
  ],
  entities: [
    { name: '배송정보', type: 'synonyms', values: [
      { value: '예상도착일', synonyms: ['언제와요', '도착일'] },
      { value: '배송상태', synonyms: ['어디까지'] },
    ] },
    { name: '수량', type: 'patterns', values: [{ value: '개', synonyms: ['\\d+\\s*개'] }] },
  ],
}

Deno.test("intents: BOM으로 시작하고 헤더가 인용된다", () => {
  const csv = toIntentsCsv(bundle)
  assertEquals(csv.startsWith('﻿"intent","example"\n'), true)
})

Deno.test("intents: 인텐트마다 example 수만큼 행이 난다", () => {
  const lines = toIntentsCsv(bundle).split('\n').filter(Boolean)
  assertEquals(lines.length, 1 + 3)   // 헤더 + (2 + 1)
  assertStringIncludes(lines[1], '"배송조회","언제 와요"')
  assertStringIncludes(lines[3], '"주문취소","취소할래"')
})

Deno.test("intents: CRLF를 쓰지 않는다", () => {
  assertEquals(toIntentsCsv(bundle).includes('\r'), false)
})

Deno.test("entities: 모든 행이 13컬럼이다", () => {
  const { csv } = toEntitiesCsv(bundle)
  const lines = csv.replace('﻿', '').split('\n').filter(Boolean)
  for (const line of lines) {
    // 인용 안의 쉼표는 세지 않는다 — 간단 파서
    let count = 1, inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) count++
    }
    assertEquals(count, 13)
  }
})

Deno.test("entities: 헤더는 named 4개 + 빈칸 9개", () => {
  const { csv } = toEntitiesCsv(bundle)
  const first = csv.replace('﻿', '').split('\n')[0]
  assertEquals(first, '"entity","value","type","synonyms",,,,,,,,,')
})

Deno.test("entities: value별로 한 행, 동의어가 4번째 칸부터 들어간다", () => {
  const { csv } = toEntitiesCsv(bundle)
  const lines = csv.replace('﻿', '').split('\n').filter(Boolean)
  assertStringIncludes(lines[1], '"배송정보","예상도착일","synonyms","언제와요","도착일"')
})

Deno.test("entities: 13컬럼을 넘는 동의어는 잘리고 보고된다(조용한 손실 금지)", () => {
  const many = { intents: [], entities: [{ name: 'E', type: 'synonyms', values: [
    { value: 'V', synonyms: Array.from({ length: 15 }, (_, i) => `s${i}`) },
  ] }] }
  const { csv, truncated } = toEntitiesCsv(many)
  assertEquals(truncated.length, 1)
  assertEquals(truncated[0].entity, 'E')
  assertEquals(truncated[0].value, 'V')
  assertEquals(truncated[0].dropped, 5)   // 3(named) + 15 = 18 → 13, 5개 잘림
  assertEquals(csv.includes('s9'), true)
  assertEquals(csv.includes('s10'), false)
})

Deno.test("entities: 잘린 게 없으면 truncated는 빈 배열", () => {
  assertEquals(toEntitiesCsv(bundle).truncated, [])
})

Deno.test("빈 번들도 헤더만 있는 유효한 CSV(후행 개행 없음)", () => {
  const empty = { intents: [], entities: [] }
  assertEquals(toIntentsCsv(empty), '﻿"intent","example"')
  assertEquals(toEntitiesCsv(empty).csv, '﻿"entity","value","type","synonyms",,,,,,,,,')
})

Deno.test("intents: 후행 개행을 붙이지 않는다(샘플은 개행 없이 끝난다)", () => {
  const csv = toIntentsCsv(bundle)
  assertEquals(csv.endsWith('\n'), false)
})

Deno.test("entities: 후행 개행을 붙이지 않는다(샘플은 개행 없이 끝난다)", () => {
  const { csv } = toEntitiesCsv(bundle)
  assertEquals(csv.endsWith('\n'), false)
})

Deno.test("번들이 없거나 이상해도 터지지 않는다", () => {
  for (const bad of [null, undefined, {}, { intents: null, entities: null }]) {
    assertStringIncludes(toIntentsCsv(bad), '"intent","example"')
    assertStringIncludes(toEntitiesCsv(bad).csv, '"entity","value","type","synonyms"')
  }
})

// ─── 샘플 대조 회귀 — 규격을 코드가 아니라 실물로 고정한다 ───

Deno.test("샘플 대조: intents 헤더·BOM·컬럼 수·끝부분이 실제 파일과 같다", async () => {
  const raw = await Deno.readTextFile('docs/superpowers/fixtures/sample-intents.csv')
  const ours = toIntentsCsv(bundle)
  assertEquals(raw.charCodeAt(0), ours.charCodeAt(0))              // 둘 다 BOM
  assertEquals(raw.replace('﻿', '').split('\n')[0],
               ours.replace('﻿', '').split('\n')[0])          // 헤더 동일
  assertEquals(raw.includes('\r'), false)
  // 끝부분: 샘플은 후행 개행 없이 마지막 셀의 닫는 따옴표로 끝난다(실측: 마지막 3바이트 9e 98 22)
  assertEquals(raw.endsWith('\n'), false)
  assertEquals(ours.endsWith('\n'), false)
  assertEquals(raw.slice(-1), ours.slice(-1))                      // 둘 다 '"'로 끝남
})

Deno.test("샘플 대조: entities 헤더·BOM·13컬럼·끝부분이 실제 파일과 같다", async () => {
  const raw = await Deno.readTextFile('docs/superpowers/fixtures/sample-entities.csv')
  const { csv } = toEntitiesCsv(bundle)
  assertEquals(raw.charCodeAt(0), csv.charCodeAt(0))
  assertEquals(raw.replace('﻿', '').split('\n')[0],
               csv.replace('﻿', '').split('\n')[0])
  assertEquals(raw.includes('\r'), false)
  // 끝부분: 샘플은 후행 개행 없이 미채움 빈 칸(,)으로 끝난다(실측: 마지막 3바이트 2c 2c 2c)
  assertEquals(raw.endsWith('\n'), false)
  assertEquals(csv.endsWith('\n'), false)
  assertEquals(raw.slice(-1), csv.slice(-1))                       // 둘 다 ','로 끝남
})

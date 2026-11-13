import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { readNodeFields, writeNodeConfig } from "./nodeConfig.js"

// ── output ────────────────────────────────────────────────────────────────
Deno.test("output: 멘트 read/write 라운드트립", () => {
  const node = { type: 'output', label: '안내', config: { items: [{ type: 'text', channels: [{ name: 'Web', use: true }], text: [{ condition: '', texts: ['안녕'] }] }], waitInput: false } }
  const f = readNodeFields(node)
  assertEquals(f.ment, '안녕')
  const cfg = writeNodeConfig('output', node.config, { ment: '반가워' })
  assertEquals(cfg.items[0].text[0].texts, ['반가워'])
  assertEquals(cfg.items[0].channels, [{ name: 'Web', use: true }]) // 기존 채널 보존
  assertEquals(cfg.waitInput, false)
})

Deno.test("output: config 없던 노드에 멘트 시드", () => {
  const cfg = writeNodeConfig('output', undefined, { ment: '처음' })
  assertEquals(cfg.items[0].type, 'text')
  assertEquals(cfg.items[0].text[0].texts, ['처음'])
  assertEquals(cfg.waitInput, false)
})

// ── set / input ─────────────────────────────────────────────────────────
Deno.test("set: 변수 scope/name/value 파싱·조립", () => {
  const f = readNodeFields({ type: 'set', config: { items: [{ key: 'local.trackingNo', value: 'input.text' }] } })
  assertEquals(f, { type: 'set', label: '', scope: 'local', name: 'trackingNo', value: 'input.text' })
  const cfg = writeNodeConfig('set', {}, { scope: 'context', name: 'flag', value: 'true' })
  assertEquals(cfg.items, [{ key: 'context.flag', value: 'true', condition: '' }])
})

Deno.test("set: secure 스코프 파싱·조립(개인정보 암호화 전역변수)", () => {
  const f = readNodeFields({ type: 'set', config: { items: [{ key: 'secure.phone', value: 'input.text' }] } })
  assertEquals({ scope: f.scope, name: f.name }, { scope: 'secure', name: 'phone' })
  const cfg = writeNodeConfig('set', {}, { scope: 'secure', name: 'phone', value: 'input.text' })
  assertEquals(cfg.items, [{ key: 'secure.phone', value: 'input.text', condition: '' }])
})

Deno.test("input: value는 input.text 고정", () => {
  const cfg = writeNodeConfig('input', {}, { scope: 'local', name: 'invoiceNo' })
  assertEquals(cfg.items, [{ key: 'local.invoiceNo', value: 'input.text', condition: '' }])
})

// ── esd ─────────────────────────────────────────────────────────────────
Deno.test("esd: findone where 라운드트립", () => {
  const config = { type: 'findone', schemaName: 'delivery', query: { where: [{ field: 'trackingNo', value: '${local.trackingNo}', expression: 'eq' }] }, result: [{ key: 'local.배송상태', value: '_result', condition: '' }] }
  const f = readNodeFields({ type: 'esd', config })
  assertEquals(f.opType, 'findone')
  assertEquals(f.schemaName, 'delivery')
  assertEquals(f.where, [{ field: 'trackingNo', expression: 'eq', value: '${local.trackingNo}' }])
  assertEquals(f.resultKey, 'local.배송상태')
  const cfg = writeNodeConfig('esd', config, f)
  assertEquals(cfg.query.where, [{ field: 'trackingNo', value: '${local.trackingNo}', expression: 'eq' }])
  assertEquals(cfg.result, [{ key: 'local.배송상태', value: '_result', condition: '' }])
})

Deno.test("esd: create는 query.data 객체로", () => {
  const cfg = writeNodeConfig('esd', {}, { opType: 'create', schemaName: 'consult', data: [{ field: 'trackingNo', value: '${local.trackingNo}' }], resultKey: 'local.상담기록' })
  assertEquals(cfg.type, 'create')
  assertEquals(cfg.query, { where: null, data: { trackingNo: '${local.trackingNo}' } })
  assertEquals(cfg.result, [{ key: 'local.상담기록', value: '_result', condition: '' }])
})

// ── api ─────────────────────────────────────────────────────────────────
Deno.test("api: apiName/params/result 라운드트립", () => {
  const config = { apiName: 'deliveryLookup', params: [{ key: 'trackingNo', value: '${local.trackingNo}' }], result: [{ key: 'local.배송상태', value: '_result', condition: '' }] }
  const f = readNodeFields({ type: 'api', config })
  assertEquals(f, { type: 'api', label: '', apiName: 'deliveryLookup', params: [{ key: 'trackingNo', value: '${local.trackingNo}' }], resultKey: 'local.배송상태' })
  const cfg = writeNodeConfig('api', config, f)
  assertEquals(cfg.apiName, 'deliveryLookup')
  assertEquals(cfg.params, [{ key: 'trackingNo', value: '${local.trackingNo}' }])
})

// ── llmchat ───────────────────────────────────────────────────────────────
Deno.test("llmchat: prompt 편집, apiKey/model 빈값 유지", () => {
  const cfg = writeNodeConfig('llmchat', { tool: '', type: 'openai', model: '', apiKey: '' }, { prompt: '너는 상담원', history: '2', stream: true })
  assertEquals(cfg.prompt, '너는 상담원')
  assertEquals(cfg.model, '')
  assertEquals(cfg.apiKey, '')
  assertEquals(cfg.stream, true)
  assertEquals(cfg.history, '2')
})

// ── subflow ─────────────────────────────────────────────────────────────
Deno.test("subflow: loop 조건/횟수 라운드트립", () => {
  const f = readNodeFields({ type: 'subflow', config: { loop: { condition: 'context.ok', count: '3' } } })
  assertEquals(f, { type: 'subflow', label: '', condition: 'context.ok', count: '3' })
  const cfg = writeNodeConfig('subflow', { loop: { condition: 'x', count: '1' }, other: 1 }, { condition: 'context.done', count: '2' })
  assertEquals(cfg.loop, { condition: 'context.done', count: '2' })
  assertEquals(cfg.other, 1) // 기타 config 보존
})

// ── node/condition: 라벨만 ─────────────────────────────────────────────────
Deno.test("node(분기): 라벨만, config 불변", () => {
  const f = readNodeFields({ type: 'node', label: '분기점', config: { keep: 1 } })
  assertEquals(f, { type: 'node', label: '분기점' })
  assertEquals(writeNodeConfig('node', { keep: 1 }, {}), { keep: 1 })
})

// ── 순수성 ─────────────────────────────────────────────────────────────────
Deno.test("write는 입력 config를 변형하지 않는다", () => {
  const config = { items: [{ type: 'text', text: [{ texts: ['원본'] }] }] }
  const snapshot = JSON.stringify(config)
  writeNodeConfig('output', config, { ment: '변경' })
  assertEquals(JSON.stringify(config), snapshot)
})

Deno.test('readNodeFields: 편집기 없는 타입은 rawConfig로 원본을 실어 보낸다 (v0.9.0)', () => {
  const cfg = { items: [{ text: 'hi' }], channels: ['web'] }
  const f = readNodeFields({ type: 'postback', label: '버튼', config: cfg })
  assertEquals(f.label, '버튼')
  assertEquals(f.rawConfig, cfg)
})

Deno.test('readNodeFields: config 없는 미지 타입도 throw하지 않는다', () => {
  const f = readNodeFields({ type: 'zzz_새타입', label: '' })
  assertEquals(f.rawConfig, undefined)
  assertEquals(f.label, '')
})

Deno.test('readNodeFields: 편집 가능한 타입에는 rawConfig가 붙지 않는다(쓰기 경로 오염 방지)', () => {
  // node/condition은 readNodeFields의 default로 떨어지지만 레지스트리상 편집 가능이라 제외돼야 한다.
  for (const t of ['output', 'set', 'esd', 'api', 'llmchat', 'subflow', 'input', 'node']) {
    const f = readNodeFields({ type: t, label: 'x', config: {} })
    assertEquals(f.rawConfig, undefined, `${t}에 rawConfig가 붙었다`)
  }
})

// ── stack 편집기 (v0.9.0, 2026-08-28 추가) ────────────────────────────────

Deno.test('stack: config.type은 노드 타입이 아니라 화면 동작이다', () => {
  const f = readNodeFields({ type: 'stack', config: { type: 'back', prompt: '', result: [] } })
  assertEquals(f.action, 'back')
  assertEquals(f.type, 'stack')   // base.type은 노드 타입 그대로
})

Deno.test('stack: 변수 목록 읽기·쓰기', () => {
  const cfg = { type: 'back', prompt: '', result: [{ key: 'context.pCnt', value: 'null', condition: '' }] }
  const f = readNodeFields({ type: 'stack', config: cfg })
  assertEquals(f.items, [{ key: 'context.pCnt', value: 'null' }])
  const out = writeNodeConfig('stack', cfg, { action: 'clear', items: [{ key: 'context.pCnt', value: '3' }] })
  assertEquals(out.type, 'clear')
  assertEquals(out.result[0].key, 'context.pCnt')
  assertEquals(out.result[0].value, '3')
  assertEquals(out.result[0].condition, '')   // 기존 condition 보존
  assertEquals(out.prompt, '')                 // 편집 대상 아닌 키 보존
})

Deno.test('stack: 모르는 동작은 clear로 떨어진다', () => {
  assertEquals(writeNodeConfig('stack', {}, { action: '없는동작', items: [] }).type, 'clear')
})

Deno.test('stack: 변수명이 빈 행은 버린다', () => {
  const out = writeNodeConfig('stack', {}, { action: 'back', items: [{ key: '', value: 'x' }, { key: 'a', value: '1' }] })
  assertEquals(out.result.length, 1)
  assertEquals(out.result[0].key, 'a')
})

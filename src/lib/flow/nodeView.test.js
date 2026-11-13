import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { nodeViewFields, viewableTypes } from './nodeView.js'
import { isEditableType, nodeTypeInfo } from './nodeTypeRegistry.js'

Deno.test('서술자가 없는 타입은 hasView=false (호출부가 원시 JSON으로 폴백)', () => {
  for (const t of ['group', 'greeting', 'fallback', 'zzz_모르는타입', '', null]) {
    assertEquals(nodeViewFields(t, {}).hasView, false, String(t))
  }
})

Deno.test('docquery: 실제 config를 읽기 좋게 편다', () => {
  const { fields, hasView } = nodeViewFields('docquery', {
    topn: '5', input: '_llm.tool.args.query', score: '0.68', apiKey: 'sk-secret',
    filter: '{"folder":"/사내업무"}',
    result: [{ key: 'context.cardResult', value: '_result', condition: '' }],
    storeId: 'ad40c6a1', endpoint: '', external: false,
  })
  assertEquals(hasView, true)
  const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]))
  assertEquals(byLabel['검색어로 쓰는 값'], '_llm.tool.args.query')
  assertEquals(byLabel['문서 저장소 ID'], 'ad40c6a1')
  assertEquals(byLabel['결과를 담을 변수'], ['context.cardResult = _result'])
  // 서술자에 없는 키는 보여주지 않는다 — apiKey가 화면에 뜨면 안 된다.
  assertEquals(fields.some((f) => String(f.value).includes('sk-secret')), false)
})

Deno.test('솔루션 저장 자원 참조 항목에는 note가 붙는다', () => {
  const f = nodeViewFields('docquery', { storeId: 'x' }).fields.find((x) => x.label === '문서 저장소 ID')
  assertEquals(f.note.includes('솔루션'), true)
  const c = nodeViewFields('component', { dialogId: 'y' }).fields.find((x) => x.label.includes('컴포넌트'))
  assertEquals(c.note.includes('솔루션'), true)
})

Deno.test('빈 값은 숨긴다 — 안 쓰는 항목까지 나열하면 읽기 어렵다', () => {
  const { fields } = nodeViewFields('shorturl', { url: 'https://x', params: '', result: [] })
  assertEquals(fields.map((f) => f.label), ['원본 URL'])
})

Deno.test('component: 전달값을 key = value로 편다', () => {
  const { fields } = nodeViewFields('component', {
    dialogId: 'fyEaK4un', params: [{ key: 'msg', value: '"p"' }], result: [],
  })
  assertEquals(fields.find((f) => f.label === '전달하는 값').value, ['msg = "p"'])
})

Deno.test('task: 종료 조건을 조건(사유)으로 편다', () => {
  const { fields } = nodeViewFields('task', {
    name: '매장예약',
    exitConditions: [{ reason: '변수 설정', condition: 'context.bookTask' }],
  })
  assertEquals(fields.find((f) => f.label === '종료 조건').value, ['context.bookTask  (변수 설정)'])
})

Deno.test('weather: 문자열 목록을 그대로 편다', () => {
  const { fields } = nodeViewFields('weather', { items: ['now', 'hour'], latitude: '4.251' })
  assertEquals(fields.find((f) => f.label === '가져올 항목').value, ['now', 'hour'])
})

Deno.test('value가 빈 pair는 key만 보여준다', () => {
  const { fields } = nodeViewFields('shorturl', { url: 'u', result: [{ key: 'r', value: '' }] })
  assertEquals(fields.find((f) => f.label === '결과를 담을 변수').value, ['r'])
})

Deno.test('잘못된 config도 throw하지 않고 값을 지어내지 않는다', () => {
  // ⚠ config가 배열이면 cfg['filter']가 Array.prototype.filter로 잡혀 화면에
  //    "function filter() { [native code] }"가 떴다. 자기 소유 키만 읽는다.
  for (const bad of [null, undefined, 'x', 42, [], Object.create({ filter: 'x' })]) {
    assertEquals(nodeViewFields('docquery', bad).hasView, true)
    assertEquals(nodeViewFields('docquery', bad).fields, [])
  }
})

Deno.test('서술자가 있는 타입은 전부 편집 불가여야 한다', () => {
  // 편집기가 생긴 타입에 읽기 전용 뷰가 남아 있으면 둘이 어긋난다.
  for (const t of viewableTypes()) {
    assertEquals(isEditableType(t), false, `${t}는 편집 가능한데 읽기 전용 뷰가 있다`)
  }
})

Deno.test('실사용 상위 잠금 노드에는 뷰가 있다', () => {
  // 잠갔더라도 무슨 노드인지는 보여야 한다.
  for (const t of ['docquery', 'component', 'agent', 'campaign', 'task']) {
    assertEquals(nodeViewFields(t, {}).hasView, true, `${t}에 뷰가 없다`)
    assertEquals(nodeTypeInfo(t).editable, false)
  }
})

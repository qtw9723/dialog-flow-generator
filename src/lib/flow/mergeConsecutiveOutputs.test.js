import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { mergeConsecutiveOutputs } from "./mergeConsecutiveOutputs.js"

const out = (id, text, then = [], extra = {}) => ({
  id, type: 'output', label: id, condition: '', then, body: [],
  config: { items: [{ type: 'text', text: [text] }], hideInput: false, waitInput: false }, ...extra,
})
const flowOf = (nodes, rootThen) => ({ dialogs: [{ id: 'main', then: rootThen, nodes }] })
const main = (f) => f.dialogs[0]
const byId = (f, id) => main(f).nodes.find((n) => n.id === id)

Deno.test("안내 → 조건 없는 안내는 한 output으로 합친다(그 턴에 함께 나가도록)", () => {
  const f = flowOf([
    { id: 'r', type: 'node', condition: 'intent("예약")', then: ['a'] },
    out('a', '반가워요', ['b']),
    out('b', '날짜를 알려주세요', ['s']),
    { id: 's', type: 'set', condition: '', then: [], config: { items: [{ key: 'local.d', value: 'input.text' }] } },
  ], ['r'])
  const { flow, merged } = mergeConsecutiveOutputs(f)
  assertEquals(merged, [{ nodeId: 'a', mergedId: 'b' }])
  assertEquals(byId(flow, 'b'), undefined)
  assertEquals(byId(flow, 'a').config.items.map((i) => i.text[0]), ['반가워요', '날짜를 알려주세요'])
  assertEquals(byId(flow, 'a').then, ['s'])
})

Deno.test("세 개가 이어지면 하나로 모은다(연쇄)", () => {
  const f = flowOf([out('a', '1', ['b']), out('b', '2', ['c']), out('c', '3', [])], ['a'])
  const { flow, merged } = mergeConsecutiveOutputs(f)
  assertEquals(merged.length, 2)
  assertEquals(main(flow).nodes.map((n) => n.id), ['a'])
  assertEquals(byId(flow, 'a').config.items.map((i) => i.text[0]), ['1', '2', '3'])
})

Deno.test("자식에 조건이 있으면 사용자 입력에 대한 응답이라 그대로 둔다", () => {
  const f = flowOf([out('a', '회원이세요?', ['b']), out('b', '네', [], { condition: 'input.text == "네"' })], ['a'])
  const { flow, merged } = mergeConsecutiveOutputs(f)
  assertEquals(merged, [])
  assertEquals(flow, f)
})

Deno.test("갈래가 둘 이상이면(분기) 그대로 둔다", () => {
  const f = flowOf([out('a', '질문', ['b', 'c']), out('b', 'x', [], { condition: 'local.x' }), out('c', '그 외')], ['a'])
  assertEquals(mergeConsecutiveOutputs(f).merged, [])
})

Deno.test("앞 멘트에 버튼 등 글자 외 항목이 있으면 버튼 입력을 기다리는 것이라 그대로 둔다", () => {
  const a = out('a', '골라 주세요', ['b'])
  a.config.items.push({ type: 'postback', buttons: [{ label: '확인', value: 'ok' }] })
  const f = flowOf([a, out('b', '확인했습니다')], ['a'])
  assertEquals(mergeConsecutiveOutputs(f).merged, [])
})

Deno.test("앞 멘트가 waitInput:true면 그대로 둔다", () => {
  const a = out('a', '1', ['b'])
  a.config.waitInput = true
  assertEquals(mergeConsecutiveOutputs(flowOf([a, out('b', '2')], ['a'])).merged, [])
})

Deno.test("뒤 멘트가 다른 곳(루트·body·다른 then)에서도 참조되면 그대로 둔다", () => {
  const f = flowOf([out('a', '1', ['b']), out('b', '2'), { id: 'loop', type: 'subflow', then: [], body: ['b'] }], ['a', 'loop'])
  assertEquals(mergeConsecutiveOutputs(f).merged, [])
  const g = flowOf([out('a', '1', ['b']), out('b', '2')], ['a', 'b'])
  assertEquals(mergeConsecutiveOutputs(g).merged, [])
})

Deno.test("config.condition도 조건으로 본다", () => {
  const b = out('b', '2')
  delete b.condition  // 최상위 condition이 없을 때만 config.condition을 본다(normalizeElseOrder와 같은 기준)
  b.config.condition = 'local.x'
  assertEquals(mergeConsecutiveOutputs(flowOf([out('a', '1', ['b']), b], ['a'])).merged, [])
})

Deno.test("dialogs 없음·빈 입력은 안전하게 통과", () => {
  assertEquals(mergeConsecutiveOutputs({}).merged, [])
  assertEquals(mergeConsecutiveOutputs(null).merged, [])
})

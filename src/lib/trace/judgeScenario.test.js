import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { judgeScenario, judgeTurn } from "./judgeScenario.js"

const o = (...texts) => ({ type: 'output', nodeId: 'x', texts })
const call = (resource, args = {}) => ({ type: 'call', nodeId: 'c', kind: 'esd', resource, op: 'findone', args })

Deno.test("부분열: 사이에 다른 사건이 끼어도 순서만 맞으면 통과", () => {
  const ev = [o('안녕하세요'), call('member', { phone: '010-0000-0000' }), o('회원님 반가워요'), { type: 'awaitInput' }]
  const ex = [{ kind: 'call', resource: 'member' }, { kind: 'output', keywordsAll: [['반가워']] }, { kind: 'awaitInput' }]
  assertEquals(judgeTurn(ev, ex), { ok: true })
})

Deno.test("순서가 뒤바뀌면 실패", () => {
  const ev = [o('반가워요'), call('member')]
  assertEquals(judgeTurn(ev, [{ kind: 'call', resource: 'member' }, { kind: 'output', keywordsAll: [['반가워']] }]).code, 'missing-output')
})

Deno.test("noCall·noOutputKeywords는 턴 전체 금지", () => {
  assertEquals(judgeTurn([o('x'), call('member')], [{ kind: 'output', keywordsAll: [['x']] }, { kind: 'noCall', resource: 'member' }]).code, 'forbidden-call')
  assertEquals(judgeTurn([o('생년월일을 알려주세요')], [{ kind: 'noOutputKeywords', keywords: ['생년월일'] }]).code, 'forbidden-output')
})

Deno.test("exact는 부분문자열(공백·대소문자 정규화), keywordsAll은 그룹마다 하나 이상", () => {
  const ev = [o('해당 세대의  관리비 정보가 없습니다. 동·호수를 다시 알려주세요')]
  assertEquals(judgeTurn(ev, [{ kind: 'output', exact: ['해당 세대의 관리비 정보가 없습니다'], keywordsAll: [['동', '호수'], ['다시']] }]), { ok: true })
  assertEquals(judgeTurn(ev, [{ kind: 'output', keywordsAll: [['연락처', '전화']] }]).ok, false)
})

Deno.test("연속 output expect는 같은 후보 문구 하나가 둘 다 만족할 때만 한 사건을 다시 쓴다", () => {
  const ev = [o('청구액은 185000원입니다. 납부 완료되었습니다', '다른 후보')]
  assertEquals(judgeTurn(ev, [{ kind: 'output', keywordsAll: [['185000']] }, { kind: 'output', keywordsAll: [['납부 완료']] }]), { ok: true })
  const ev2 = [o('청구액은 185000원입니다', '납부 완료되었습니다')]
  assertEquals(judgeTurn(ev2, [{ kind: 'output', keywordsAll: [['185000']] }, { kind: 'output', keywordsAll: [['납부 완료']] }]).ok, false)
})

Deno.test("call 인수: equals·fromTurnText, 자원 이름 대응표", () => {
  const ev = [call('세대관리비', { unit_no: '101-1203' })]
  const ex = [{ kind: 'call', resource: '세대_관리비', args: { unit_no: { fromTurnText: 0 } } }]
  assertEquals(judgeTurn(ev, ex, { resourceMap: { 세대_관리비: '세대관리비' }, userTexts: ['101-1203'] }), { ok: true })
  assertEquals(judgeTurn(ev, ex, { resourceMap: { 세대_관리비: '세대관리비' }, userTexts: ['202-0101'] }).ok, false)
  assertEquals(judgeTurn(ev, [{ kind: 'call', resource: '세대_관리비', args: { unit_no: { equals: ' 101-1203 ' } } }], { resourceMap: { 세대_관리비: '세대관리비' } }).ok, true)
})

Deno.test("시나리오: 모든 턴 통과면 pass, unknown 턴이 있으면 unknown, 실패 위치를 남긴다", () => {
  const sc = { turns: [{ user: { text: 'a' }, expect: [{ kind: 'output', keywordsAll: [['A']] }] }, { user: { text: 'b' }, expect: [{ kind: 'end' }] }] }
  assertEquals(judgeScenario({ turns: [{ events: [o('A')] }, { events: [{ type: 'end' }] }] }, sc), { status: 'pass' })
  assertEquals(judgeScenario({ turns: [{ events: [o('A')] }, { events: [{ type: 'unknown', reason: 'loop' }] }] }, sc), { status: 'unknown', turn: 1, code: 'loop' })
  assertEquals(judgeScenario({ turns: [{ events: [o('B')] }, { events: [{ type: 'end' }] }] }, sc), { status: 'fail', turn: 0, code: 'missing-output', at: 0 })
})

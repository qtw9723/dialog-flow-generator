import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { traceDialogue } from "./dialogueTrace.js"

// 생성기 출력 모양(회귀-하위흐름봇, 이어지는 멘트 합친 뒤)을 줄인 봇.
const say = (t) => ({ type: 'text', text: [{ texts: [t] }], condition: '' })
const out = (id, texts, then = [], condition = '') => ({ id, type: 'output', label: id, condition, then, body: [], config: { items: texts.map(say), hideInput: false, waitInput: false } })
function reservationBot() {
  return {
    dialogs: [
      { id: 'predialog', then: [], nodes: [] },
      {
        id: 'main', then: ['n1', 'n3', 'ae'], nodes: [
          { id: 'n1', type: 'greeting', condition: '_greeting', then: ['n2'] },
          out('n2', ['안녕하세요! 무엇을 도와드릴까요?']),
          { id: 'n3', type: 'node', condition: 'intent("진료예약")', then: ['n4'] },
          out('n4', ['진료 예약을 위해 연락처를 알려주세요.'], ['n5']),
          { id: 'n5', type: 'set', condition: '', then: ['n6'], config: { items: [{ key: 'local.phone', value: 'input.text' }] } },
          { id: 'n6', type: 'esd', condition: '', then: ['n7'], config: { type: 'findone', schemaName: 'member', query: { where: [{ field: 'phone', value: 'local.phone', expression: 'eq' }] }, result: [{ key: 'local.memberInfo', value: '_result', condition: '' }] } },
          { id: 'n7', type: 'node', condition: '', then: ['n8', 'n11'] },
          out('n8', ['회원님 반가워요, ${local.memberInfo.member_name}님!', '예약을 원하시는 날짜를 말씀해 주세요.'], ['n10'], 'local.memberInfo != null'),
          { id: 'n10', type: 'set', condition: '', then: ['n12'], config: { items: [{ key: 'local.reservationDate', value: 'input.text' }] } },
          out('n11', ['회원 정보가 없네요. 회원 가입을 먼저 해주세요.'], [], 'local.memberInfo == null'),
          { id: 'n12', type: 'esd', condition: '', then: ['n13'], config: { type: 'create', schemaName: 'reservation', query: { data: { phone: 'local.phone', reservationDate: 'local.reservationDate' } }, result: [{ key: 'local.reservation', value: '_result', condition: '' }] } },
          out('n13', ['진료 예약이 완료되었습니다. 예약일: ${local.reservationDate}']),
          { id: 'ae', type: 'fallback', condition: '', then: ['ae_out'] },
          out('ae_out', ['잘 못 알아들었어요!']),
        ],
      },
      { id: 'postdialog', then: ['err'], nodes: [out('err', ['에러가 발생했습니다.'], [], '_error')] },
    ],
  }
}
const kinds = (t) => t.events.map((e) => e.type)
const texts = (t) => t.events.filter((e) => e.type === 'output').flatMap((e) => e.texts)

Deno.test("회원 경로: 질문 → 입력 → 조회 → 두 안내가 한 턴에 → 예약일 입력 → 저장·완료", () => {
  const r = traceDialogue(reservationBot(), {
    turns: [{ start: true }, { intent: '진료예약', text: '예약할래요' }, { text: '010-0000-0000' }, { text: '11월 3일' }],
    stubs: { member: { outcome: 'success', response: { member_name: '김예시' } }, reservation: { outcome: 'success', response: { id: 'R-1' } } },
  })
  assertEquals(r.status, 'ok')
  assertEquals(texts(r.turns[0]), ['안녕하세요! 무엇을 도와드릴까요?'])
  assertEquals(kinds(r.turns[0]), ['output', 'end'])
  assertEquals(kinds(r.turns[1]), ['output', 'awaitInput'])
  assertEquals(r.turns[2].events[0], { type: 'call', nodeId: 'n6', kind: 'esd', resource: 'member', op: 'findone', args: { phone: '010-0000-0000' } })
  assertEquals(texts(r.turns[2]), ['회원님 반가워요, 김예시님!', '예약을 원하시는 날짜를 말씀해 주세요.'])
  assertEquals(r.turns[3].events[0].args, { phone: '010-0000-0000', reservationDate: '11월 3일' })
  assertEquals(texts(r.turns[3]), ['진료 예약이 완료되었습니다. 예약일: 11월 3일'])
  assertEquals(kinds(r.turns[3]).at(-1), 'end')
})

Deno.test("빈 결과: 비회원 갈래로 가고 저장은 부르지 않는다", () => {
  const r = traceDialogue(reservationBot(), {
    turns: [{ intent: '진료예약', text: '예약' }, { text: '010-0000-0000' }],
    stubs: { member: { outcome: 'empty' } },
  })
  assertEquals(texts(r.turns[1]), ['회원 정보가 없네요. 회원 가입을 먼저 해주세요.'])
  assertEquals(r.turns[1].events.filter((e) => e.type === 'call').map((e) => e.resource), ['member'])
  assertEquals(kinds(r.turns[1]).at(-1), 'end')
})

Deno.test("호출 실패: Main을 멈추고 Post의 에러 안내, 다음 입력은 루트부터", () => {
  const r = traceDialogue(reservationBot(), {
    turns: [{ intent: '진료예약', text: '예약' }, { text: '010-0000-0000' }, { text: '아무말' }],
    stubs: { member: { outcome: 'error' } },
  })
  assertEquals(texts(r.turns[1]), ['에러가 발생했습니다.'])
  assertEquals(kinds(r.turns[1]).at(-1), 'end')
  assertEquals(texts(r.turns[2]), ['잘 못 알아들었어요!'])
})

Deno.test("이어지는 멘트가 나뉘어 있으면 두 번째 멘트는 다음 입력 뒤에 나온다(솔루션 확인 동작)", () => {
  const bot = { dialogs: [{ id: 'main', then: ['w'], nodes: [
    { id: 'w', type: 'greeting', condition: '_greeting', then: ['a'] },
    out('a', ['[1]'], ['b']), out('b', ['[2]'], ['s']),
    { id: 's', type: 'set', condition: '', then: ['c'], config: { items: [{ key: 'local.answer', value: 'input.text' }] } },
    out('c', ['[3] ${local.answer}']),
  ] }] }
  const r = traceDialogue(bot, { turns: [{ start: true }, { text: '아무거나' }, { text: '사과' }] })
  assertEquals(texts(r.turns[0]), ['[1]'])
  assertEquals(texts(r.turns[1]), ['[2]'])
  assertEquals(texts(r.turns[2]), ['[3] 사과'])
})

Deno.test("미지원(llmchat)에 닿으면 unknown으로 멈추고 이후 턴은 halted-earlier", () => {
  const bot = { dialogs: [{ id: 'main', then: ['r'], nodes: [
    { id: 'r', type: 'node', condition: 'intent("q")', then: ['l'] },
    { id: 'l', type: 'llmchat', condition: '', then: [], body: [] },
  ] }] }
  const r = traceDialogue(bot, { turns: [{ intent: 'q' }, { text: 'x' }] })
  assertEquals(r.status, 'unknown')
  assertEquals(r.turns[0].events.at(-1), { type: 'unknown', reason: 'unsupported-node:llmchat', nodeId: 'l' })
  assertEquals(r.turns[1].events, [{ type: 'unknown', reason: 'halted-earlier' }])
})

Deno.test("정의되지 않은 이름·멘트 안 함수 호출·stub 없음은 unknown", () => {
  const mk = (cond, text = 'x') => ({ dialogs: [{ id: 'main', then: ['r'], nodes: [{ id: 'r', type: 'node', condition: cond, then: ['o'] }, out('o', [text])] }] })
  assertEquals(traceDialogue(mk('entity("날짜")'), { turns: [{ text: 'a' }] }).turns[0].events[0].reason, 'undefined-name:entity')
  assertEquals(traceDialogue(mk('', '${local.list.join(",")}'), { turns: [{ text: 'a' }] }).turns[0].events[0].reason, 'function-in-template')
  const call = { dialogs: [{ id: 'main', then: ['c'], nodes: [{ id: 'c', type: 'api', condition: '', then: [], config: { apiName: 'getX', params: [] } }] }] }
  assertEquals(traceDialogue(call, { turns: [{ text: 'a' }] }).turns[0].events.at(-1).reason, 'no-stub:getX')
})

Deno.test("전역 접근은 막힌다(범위 밖 이름 = unknown)", () => {
  const bot = { dialogs: [{ id: 'main', then: ['r'], nodes: [{ id: 'r', type: 'node', condition: 'Deno.exit(1)', then: [] }] }] }
  assertEquals(traceDialogue(bot, { turns: [{ text: 'a' }] }).turns[0].events[0].reason, 'forbidden-expression')
  const bot2 = { dialogs: [{ id: 'main', then: ['r'], nodes: [{ id: 'r', type: 'node', condition: 'setTimeout', then: [] }] }] }
  assertEquals(traceDialogue(bot2, { turns: [{ text: 'a' }] }).turns[0].events[0].reason, 'undefined-name:setTimeout')
})

Deno.test("주석뿐인 조건은 꺼진 노드 — 다음 형제로", () => {
  const bot = { dialogs: [{ id: 'main', then: ['r1', 'r2'], nodes: [
    { id: 'r1', type: 'node', condition: '// 사용 안 함', then: ['o1'] }, out('o1', ['꺼짐']),
    { id: 'r2', type: 'node', condition: '', then: ['o2'] }, out('o2', ['켜짐']),
  ] }] }
  assertEquals(texts(traceDialogue(bot, { turns: [{ text: 'a' }] }).turns[0]), ['켜짐'])
})

Deno.test("stub 배열은 호출 순번별(넘치면 마지막 반복)", () => {
  const bot = { dialogs: [{ id: 'main', then: ['c'], nodes: [
    { id: 'c', type: 'api', condition: '', then: ['o'], config: { apiName: 'n', params: [], result: [{ key: 'local.v', value: '_result.v' }] } },
    out('o', ['${local.v}']),
  ] }] }
  const r = traceDialogue(bot, { turns: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], stubs: { n: [{ outcome: 'success', response: { v: 1 } }, { outcome: 'success', response: { v: 2 } }] } })
  assertEquals(r.turns.map(texts), [['1'], ['2'], ['2']])
})

Deno.test("반복 아닌 subflow: body의 output 뒤 다음 턴은 subflow의 then", () => {
  const bot = { dialogs: [{ id: 'main', then: ['r'], nodes: [
    { id: 'r', type: 'node', condition: 'intent("go")', then: ['sd'] },
    { id: 'sd', type: 'subflow', condition: '', body: ['q'], then: ['after'], config: { loop: { count: '', condition: '' } } },
    out('q', ['이름이 뭐예요?'], ['never']), out('never', ['안 나와야 함']),
    out('after', ['다음 단계']),
  ] }] }
  const r = traceDialogue(bot, { turns: [{ intent: 'go' }, { text: '김예시' }] })
  assertEquals(texts(r.turns[0]), ['이름이 뭐예요?'])
  assertEquals(texts(r.turns[1]), ['다음 단계'])
})

Deno.test("문구 묶음의 condition이 거짓이면 후보에서 뺀다, 모르는 이름이면 unknown", () => {
  const mk = (cond) => ({ dialogs: [{ id: 'main', then: ['o'], nodes: [{ id: 'o', type: 'output', condition: '', then: [], config: { items: [{ type: 'text', text: [{ texts: ['A'], condition: 'local.n == null' }, { texts: ['B'], condition: cond }] }] } }] }] })
  assertEquals(texts(traceDialogue(mk('local.n != null'), { turns: [{ text: 'x' }] }).turns[0]), ['A'])
  assertEquals(traceDialogue(mk('_unknownVar >= 1'), { turns: [{ text: 'x' }] }).turns[0].events[0].reason, 'undefined-name:_unknownVar')
})

// 반복-확인봇(2026-10-26 솔루션 확인)과 같은 구조: count 3, 중단 조건 context.ok
function loopBot() {
  return { dialogs: [{ id: 'main', then: ['w'], nodes: [
    { id: 'w', type: 'greeting', condition: '_greeting', then: ['loop'] },
    { id: 'loop', type: 'subflow', condition: '', then: ['done'], body: ['ask'], config: { loop: { count: '3', condition: 'context.ok' } } },
    out('ask', ['[질문 ${_loopCount}]'], ['chk']),
    { id: 'chk', type: 'set', condition: '', then: [], config: { items: [{ key: 'context.ok', value: "input.text == 'ok'" }] } },
    out('done', ['[반복 끝] ${context.ok}']),
  ] }] }
}

Deno.test("반복: 통과 입력이면 그 턴에 바로 반복 끝(솔루션 확인)", () => {
  const r = traceDialogue(loopBot(), { turns: [{ start: true }, { text: 'ok' }] })
  assertEquals(r.turns.map(texts), [['[질문 0]'], ['[반복 끝] true']])
  assertEquals(kinds(r.turns[1]).at(-1), 'end')
})

Deno.test("반복: count 3 — 실패 세 번이면 조건 거짓인 채로 빠져나간다(솔루션 확인)", () => {
  const r = traceDialogue(loopBot(), { turns: [{ start: true }, { text: 'no' }, { text: 'no' }, { text: 'no' }] })
  assertEquals(r.status, 'ok')
  assertEquals(r.turns.map(texts), [['[질문 0]'], ['[질문 1]'], ['[질문 2]'], ['[반복 끝] false']])
})

Deno.test("반복: 중단 조건이 처음부터 참이면 본문을 건너뛴다", () => {
  const bot = loopBot()
  bot.dialogs[0].nodes.unshift({ id: 'pre', type: 'set', condition: '', then: ['loop'], config: { items: [{ key: 'context.ok', value: 'true' }] } })
  bot.dialogs[0].nodes.find((n) => n.id === 'w').then = ['pre']
  assertEquals(texts(traceDialogue(bot, { turns: [{ start: true }] }).turns[0]), ['[반복 끝] true'])
})

Deno.test("반복: 조건·횟수 모두 비면 반복 아님, 횟수가 숫자가 아니면 unknown", () => {
  const bot = loopBot()
  bot.dialogs[0].nodes.find((n) => n.id === 'loop').config.loop = { count: 'many', condition: 'context.ok' }
  assertEquals(traceDialogue(bot, { turns: [{ start: true }] }).turns[0].events[0].reason, 'loop-count-not-number')
})

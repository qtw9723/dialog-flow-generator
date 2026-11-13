import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { deriveStructure, deriveUserFlow, conditionLabel } from "./refDiagram.js"

// spec §R1 fixture: main.then=[w, n1, fallback]
// w(greeting)→greet(output) / n1(output,"배송 안내", condition:"배송 어디쯤이야")→ask(input)→vloop(subflow)→done(output) / fallback
const exampleFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: ['greet'] },
      {
        id: 'greet', type: 'output', label: '환영 인사',
        config: { items: [{ type: 'text', text: [{ texts: ['안녕하세요!'] }] }] },
        then: [],
      },
      {
        id: 'n1', type: 'output', label: '배송 안내',
        condition: '배송 어디쯤이야',
        config: { items: [{ type: 'text', text: [{ texts: ['배송 안내입니다.'] }] }] },
        then: ['ask'],
      },
      { id: 'ask', type: 'input', label: '송장번호 입력', then: ['vloop'] },
      {
        id: 'vloop', type: 'subflow', label: '형식 검증',
        config: { loop: { condition: 'context.ok', count: '3' } },
        body: ['retry'],
        then: ['done'],
      },
      {
        id: 'retry', type: 'output', label: '다시 입력 안내',
        config: { items: [{ type: 'text', text: [{ texts: ['다시 입력해 주세요.'] }] }] },
        then: [],
      },
      {
        id: 'done', type: 'output', label: '조회 결과 안내',
        config: { items: [{ type: 'text', text: [{ texts: ['조회 결과입니다.'] }] }] },
        then: [],
      },
      { id: 'fallback', type: 'fallback', then: [] },
    ],
    then: ['w', 'n1', 'fallback'],
  }],
}

// ── deriveStructure ─────────────────────────────────────────────

Deno.test('deriveStructure: 보일러플레이트(w·greet·fallback) 제외', () => {
  const { nodes, edges } = deriveStructure(exampleFlow)
  const ids = nodes.map(n => n.id)
  assertEquals(ids.includes('w'), false, 'w 제외')
  assertEquals(ids.includes('greet'), false, 'greet 제외')
  assertEquals(ids.includes('fallback'), false, 'fallback 제외')
  // 엣지에도 보일러플레이트 없음
  const ep = edges.map(e => `${e.from}→${e.to}`)
  assertEquals(ep.some(e => /\bw\b|\bgreet\b|\bfallback\b/.test(e)), false)
})

Deno.test('deriveStructure: 시나리오 그룹 — root·title·nodeIds', () => {
  const { scenarios } = deriveStructure(exampleFlow)
  assertEquals(scenarios.length, 1)
  const s = scenarios[0]
  assertEquals(s.rootId, 'n1')
  assertEquals(s.title, '배송 안내')
  assertEquals(s.nodeIds.includes('n1'), true, 'n1 포함')
  assertEquals(s.nodeIds.includes('ask'), true, 'ask 포함')
  assertEquals(s.nodeIds.includes('vloop'), true, 'vloop 포함')
  assertEquals(s.nodeIds.includes('done'), true, 'done 포함')
  assertEquals(s.nodeIds.includes('retry'), true, 'retry(루프 내부) 포함')
  assertEquals(s.nodeIds.includes('w'), false, 'w 미포함')
  assertEquals(s.nodeIds.includes('greet'), false, 'greet 미포함')
})

Deno.test('deriveStructure: nodes — 라벨·kindKo·scenarioRootId', () => {
  const { nodes } = deriveStructure(exampleFlow)
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const n1 = byId['n1']
  assertEquals(n1.label, '배송 안내')
  assertEquals(n1.type, 'output')
  assertEquals(n1.kindKo, '안내')
  assertEquals(n1.scenarioRootId, 'n1')
  assertEquals(byId['ask'].kindKo, '입력')
  assertEquals(byId['vloop'].kindKo, '반복')
  assertEquals(byId['done'].kindKo, '안내')
  assertEquals(byId['retry'].kindKo, '안내')
})

Deno.test('deriveStructure: edges — 순서·내용', () => {
  const { edges } = deriveStructure(exampleFlow)
  const ep = edges.map(e => `${e.from}→${e.to}`)
  assertEquals(ep.includes('n1→ask'), true, 'n1→ask')
  assertEquals(ep.includes('ask→vloop'), true, 'ask→vloop')
  assertEquals(ep.includes('vloop→done'), true, 'vloop→done')
  // body 내부 엣지는 main edges에 포함되지 않음
  assertEquals(ep.includes('vloop→retry'), false, 'vloop→retry 미포함')
})

Deno.test('deriveStructure: loops — id·bodyIds·exitCondition·maxCount', () => {
  const { loops } = deriveStructure(exampleFlow)
  assertEquals(loops.length, 1)
  const lp = loops[0]
  assertEquals(lp.id, 'vloop')
  assertEquals(lp.bodyIds.includes('retry'), true)
  assertEquals(lp.exitCondition, 'context.ok')
  assertEquals(lp.maxCount, '3')
})

// ── deriveUserFlow ──────────────────────────────────────────────

Deno.test('deriveUserFlow: user/bot 교대 순서·스텝 수', () => {
  const { scenarios } = deriveUserFlow(exampleFlow)
  assertEquals(scenarios.length, 1)
  assertEquals(scenarios[0].title, '배송 안내')
  const steps = scenarios[0].steps
  assertEquals(steps.length, 4)
  assertEquals(steps[0].actor, 'user')
  assertEquals(steps[1].actor, 'bot')
  assertEquals(steps[2].actor, 'user')
  assertEquals(steps[3].actor, 'bot')
})

Deno.test('deriveUserFlow: 진입 트리거 → user 스텝', () => {
  const steps = deriveUserFlow(exampleFlow).scenarios[0].steps
  assertEquals(steps[0].actor, 'user')
  assertEquals(steps[0].text, '배송 어디쯤이야')
})

Deno.test('deriveUserFlow: output → bot 스텝(첫 멘트)', () => {
  const steps = deriveUserFlow(exampleFlow).scenarios[0].steps
  assertEquals(steps[1].actor, 'bot')
  assertEquals(steps[1].text, '배송 안내입니다.')
  assertEquals(steps[3].actor, 'bot')
  assertEquals(steps[3].text, '조회 결과입니다.')
})

Deno.test('deriveUserFlow: subflow 검증루프 → 직전 user 스텝에 repeat:true 접기', () => {
  const steps = deriveUserFlow(exampleFlow).scenarios[0].steps
  const inputStep = steps[2]
  assertEquals(inputStep.actor, 'user')
  assertEquals(inputStep.text, '송장번호 입력')
  assertEquals(inputStep.repeat, true)
})

Deno.test('deriveUserFlow: 보일러플레이트(greeting·fallback) 스텝 미생성', () => {
  const steps = deriveUserFlow(exampleFlow).scenarios[0].steps
  // greet(greeting 서브트리 output)가 bot 스텝으로 나타나면 안 됨
  const texts = steps.map(s => s.text)
  assertEquals(texts.includes('안녕하세요!'), false)
})

// ── 분기(choices) ──────────────────────────────────────────────

const branchFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: [] },
      {
        id: 'root', type: 'output', label: '어떤 도움이 필요하세요?',
        condition: '도움 요청',
        config: { items: [{ type: 'text', text: [{ texts: ['어떤 도움이 필요하세요?'] }] }] },
        then: ['branch1', 'branch2'],
      },
      {
        id: 'branch1', type: 'output', label: '배송 조회',
        config: { items: [{ type: 'text', text: [{ texts: ['배송 조회 안내입니다.'] }] }] },
        then: [],
      },
      {
        id: 'branch2', type: 'output', label: '반품 안내',
        config: { items: [{ type: 'text', text: [{ texts: ['반품 안내입니다.'] }] }] },
        then: [],
      },
      { id: 'fallback', type: 'fallback', then: [] },
    ],
    then: ['w', 'root', 'fallback'],
  }],
}

Deno.test('deriveStructure: then 2개 → 분기 edges 2개', () => {
  const { scenarios, edges } = deriveStructure(branchFlow)
  assertEquals(scenarios.length, 1)
  assertEquals(scenarios[0].rootId, 'root')
  const ep = edges.map(e => `${e.from}→${e.to}`)
  assertEquals(ep.includes('root→branch1'), true, 'root→branch1')
  assertEquals(ep.includes('root→branch2'), true, 'root→branch2')
})

Deno.test('deriveStructure: 엣지에 대상 노드의 condition·label이 실린다', () => {
  const { edges } = deriveStructure(branchFlow)
  const e1 = edges.find(e => e.from === 'root' && e.to === 'branch1')
  // branchFlow의 자식은 condition이 없고 label만 있음 → condition 빈 문자열, label 채워짐
  assertEquals(e1.condition, '')
  assertEquals(e1.label, '배송 조회')
})

Deno.test('conditionLabel: 조건 우선, 없으면 라벨 폴백, includes 표현은 값만 추출', () => {
  assertEquals(conditionLabel('', '배송 조회'), '배송 조회')          // 폴백
  assertEquals(conditionLabel('도움 요청', '무시'), '도움 요청')        // 조건 우선
  assertEquals(conditionLabel("input.text.includes('배송')", 'x'), '배송') // 값 추출
  assertEquals(conditionLabel('input.text.includes("반품")', 'x'), '반품')
  assertEquals(conditionLabel('_loopCount == 0', 'x'), '_loopCount == 0')  // 그 외 원문
  assertEquals(conditionLabel("input.text.includes('그만') == false", 'x'), '그만 아님')  // 부정
  assertEquals(conditionLabel("!input.text.includes('그만')", 'x'), '그만 아님')          // 부정(!)
  assertEquals(conditionLabel('', ''), '')
})

Deno.test('deriveUserFlow: then 2개 → choices 변환', () => {
  const steps = deriveUserFlow(branchFlow).scenarios[0].steps
  // 진입 트리거(user) + 분기 bot 스텝
  assertEquals(steps[0].actor, 'user')
  assertEquals(steps[0].text, '도움 요청')
  const branchStep = steps[1]
  assertEquals(branchStep.actor, 'bot')
  assertEquals(Array.isArray(branchStep.choices), true)
  assertEquals(branchStep.choices.includes('배송 조회'), true)
  assertEquals(branchStep.choices.includes('반품 안내'), true)
})

// ── 반복 본문 내부 엣지(bodyEdges) ─────────────────────────────

const loopBodyFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: [] },
      {
        id: 'root', type: 'output', label: '수집 시작', condition: '주문할게',
        then: ['vloop', 'done'],
      },
      {
        id: 'vloop', type: 'subflow', label: '형식 검증',
        config: { loop: { condition: 'context.ok', count: '3' } },
        body: ['ask', 'save'], then: ['done'],
      },
      { id: 'ask', type: 'output', label: '다시 입력 안내', then: ['save'] },
      { id: 'save', type: 'set', label: '값 저장', then: [] },
      { id: 'done', type: 'output', label: '완료 안내', then: [] },
      { id: 'fallback', type: 'fallback', then: [] },
    ],
    then: ['w', 'root', 'fallback'],
  }],
}

Deno.test('deriveStructure: 반복 loop에 bodyIds·bodyEdges가 파생된다', () => {
  const { loops, edges } = deriveStructure(loopBodyFlow)
  const loop = loops.find(l => l.id === 'vloop')
  assertEquals(!!loop, true, 'vloop loop 존재')
  assertEquals(loop.bodyIds.includes('ask'), true)
  assertEquals(loop.bodyIds.includes('save'), true)
  // 본문 내부 ask→save 엣지가 bodyEdges에 있고, 메인 edges에는 없다(박스 안에서만 연결)
  const be = loop.bodyEdges.map(e => `${e.from}→${e.to}`)
  assertEquals(be.includes('ask→save'), true, '본문 내부 엣지')
  const mainEp = edges.map(e => `${e.from}→${e.to}`)
  assertEquals(mainEp.includes('ask→save'), false, '본문 엣지는 메인에 없음')
  assertEquals(loop.exitCondition, 'context.ok')
  assertEquals(loop.maxCount, '3')
})

// ── 사용자 흐름도: 봇 멘트 전문 표시(자르지 않음) ──────────────────────

Deno.test('deriveUserFlow: 60자 넘는 봇 멘트도 자르지 않고 전문 표시', () => {
  const longText = '배송 조회 결과를 운송장번호와 함께 상세히 안내하고, 예상 도착일과 현재 위치, 배송 담당자 연락처까지 모두 알려드립니다.'
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: [] },
        { id: 'r', type: 'output', label: '안내', condition: '배송 조회',
          config: { items: [{ type: 'text', text: [{ texts: [longText] }] }] }, then: [] },
        { id: 'fallback', type: 'fallback', then: [] },
      ],
      then: ['w', 'r', 'fallback'],
    }],
  }
  const steps = deriveUserFlow(flow).scenarios[0].steps
  const botStep = steps.find(s => s.actor === 'bot')
  assertEquals(botStep.text, longText, '전문 그대로(말줄임 없음)')
  assertEquals(botStep.text.includes('…'), false)
})

// ── 사용자 흐름도: 턴 교대(발화↔응답) 모델 ────────────────────────────

Deno.test('deriveUserFlow: api/esd 내부 처리는 별도 봇 답변이 아니라 다음 응답의 actions로 접힌다', () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: [] },
        { id: 'r', type: 'output', label: '입력 요청', condition: '배송 조회',
          config: { items: [{ type: 'text', text: [{ texts: ['운송장번호를 입력해 주세요.'] }] }] }, then: ['api'] },
        { id: 'api', type: 'api', label: '배송 조회', then: ['esd'] },
        { id: 'esd', type: 'esd', label: '기록', then: ['o2'] },
        { id: 'o2', type: 'output', label: '결과 안내',
          config: { items: [{ type: 'text', text: [{ texts: ['배송 상태를 안내드립니다.'] }] }] }, then: [] },
        { id: 'fallback', type: 'fallback', then: [] },
      ],
      then: ['w', 'r', 'fallback'],
    }],
  }
  const steps = deriveUserFlow(flow).scenarios[0].steps
  // api/esd가 'API 조회함'/'기록 저장함' 봇 스텝으로 나오지 않음
  assertEquals(steps.some(s => s.text === 'API 조회함' || s.text === '기록 저장함'), false)
  // 결과 안내 응답에 처리 주석(actions)으로 접힘
  const result = steps.find(s => s.text === '배송 상태를 안내드립니다.')
  assertEquals(result.actions.includes('조회'), true)
  assertEquals(result.actions.includes('기록 저장'), true)
})

Deno.test('deriveUserFlow: 봇 답변이 연달으면 사이에 wait(사용자 응답 대기)가 삽입돼 두 답이 붙지 않는다', () => {
  const flow = {
    dialogs: [{
      id: 'main',
      nodes: [
        { id: 'w', type: 'greeting', then: [] },
        { id: 'r', type: 'output', label: '첫 안내', condition: '시작',
          config: { items: [{ type: 'text', text: [{ texts: ['안녕하세요.'] }] }] }, then: ['o2'] },
        { id: 'o2', type: 'output', label: '두번째 안내',
          config: { items: [{ type: 'text', text: [{ texts: ['무엇을 도와드릴까요?'] }] }] }, then: [] },
        { id: 'fallback', type: 'fallback', then: [] },
      ],
      then: ['w', 'r', 'fallback'],
    }],
  }
  const steps = deriveUserFlow(flow).scenarios[0].steps
  assertEquals(steps.some(s => s.actor === 'wait'), true, 'wait 삽입됨')
  // 인접한 두 봇 스텝이 없음
  let adjacentBot = false
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].actor === 'bot' && steps[i - 1].actor === 'bot') adjacentBot = true
  }
  assertEquals(adjacentBot, false, '봇-봇 인접 없음')
})

// ── __init 스캐폴딩을 건너뛴 엣지 브리지 (여러 송장 조회 유형 버그) ──────

const initBridgeFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: [] },
      { id: 'r', type: 'node', label: '진입', condition: '조회', then: ['r_setinit'] },
      { id: 'r_setinit', type: 'set', label: '수집 초기화', then: ['r_col__init'] },
      { id: 'r_col__init', type: 'set', label: '(init)', then: ['r_col'] },  // __init → 숨김·건너뜀
      { id: 'r_col', type: 'subflow', label: '반복 수집', config: { loop: { count: '10' } }, body: ['r_o1'], then: ['r_o2'] },
      { id: 'r_o1', type: 'output', label: '입력받기', then: [] },
      { id: 'r_o2', type: 'output', label: '확인 안내', then: [] },
      { id: 'fallback', type: 'fallback', then: [] },
    ],
    then: ['w', 'r', 'fallback'],
  }],
}

Deno.test('deriveStructure: __init 스캐폴딩을 건너뛰어 엣지를 이어준다(반복 박스가 떠 보이지 않게)', () => {
  const { nodes, edges } = deriveStructure(initBridgeFlow)
  const ids = nodes.map(n => n.id)
  assertEquals(ids.includes('r_col__init'), false, '__init 노드는 숨김')
  const ep = edges.map(e => `${e.from}→${e.to}`)
  // r_setinit → r_col__init(건너뜀) → r_col  ⇒  r_setinit→r_col 직접 이어짐
  assertEquals(ep.includes('r_setinit→r_col'), true, '__init 건너뛴 브리지 엣지')
  assertEquals(ep.includes('r_setinit→r_col__init'), false, '__init로의 엣지는 없음')
  // r_col(반복 박스)이 들어오는 엣지를 가져 진입점이 아니게 됨
  const indeg = {}
  for (const e of edges) indeg[e.to] = (indeg[e.to] || 0) + 1
  assertEquals(indeg['r_col'] >= 1, true, '반복 박스에 진입 엣지 존재(떠있지 않음)')
})

// ── __init 내부 노드 숨김 ───────────────────────────────────────

const initFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: [] },
      {
        id: 'n1', type: 'output', label: '안내',
        config: { items: [{ type: 'text', text: [{ texts: ['안내 메시지'] }] }] },
        then: ['n1__init', 'next'],
      },
      { id: 'n1__init', type: 'set', label: '초기화', then: [] },
      {
        id: 'next', type: 'output', label: '다음 안내',
        config: { items: [{ type: 'text', text: [{ texts: ['다음 메시지'] }] }] },
        then: [],
      },
      { id: 'fallback', type: 'fallback', then: [] },
    ],
    then: ['w', 'n1', 'fallback'],
  }],
}

Deno.test('deriveStructure: __init 노드 nodes·edges 미포함', () => {
  const { nodes, edges } = deriveStructure(initFlow)
  const ids = nodes.map(n => n.id)
  assertEquals(ids.includes('n1__init'), false, '__init 제외')
  assertEquals(ids.includes('n1'), true, 'n1 포함')
  assertEquals(ids.includes('next'), true, 'next 포함')
  const ep = edges.map(e => `${e.from}→${e.to}`)
  assertEquals(ep.includes('n1→n1__init'), false, '__init 엣지 제외')
})

Deno.test('deriveUserFlow: __init 노드 스텝 미생성', () => {
  const steps = deriveUserFlow(initFlow).scenarios[0].steps
  const texts = steps.map(s => s.text)
  assertEquals(texts.includes('초기화'), false, '__init 스텝 미생성')
})

// ── label 폴백 (TYPE_KO) ───────────────────────────────────────

// label 없는 가시(visible) 노드를 포함한 fixture — api·esd 노드에 label 미지정
const noLabelFlow = {
  dialogs: [{
    id: 'main',
    nodes: [
      { id: 'w', type: 'greeting', then: [] },
      {
        id: 'root', type: 'output', label: '시나리오 루트',
        condition: '시작',
        config: { items: [{ type: 'text', text: [{ texts: ['시작합니다.'] }] }] },
        then: ['apiNode', 'esdNode'],
      },
      { id: 'apiNode', type: 'api', then: [] },
      { id: 'esdNode', type: 'esd', then: [] },
      { id: 'fallback', type: 'fallback', then: [] },
    ],
    then: ['w', 'root', 'fallback'],
  }],
}

Deno.test('deriveStructure: label 없는 가시 노드 → TYPE_KO 폴백', () => {
  const { nodes } = deriveStructure(noLabelFlow)
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  // api 노드: label 미지정 → TYPE_KO['api'] 폴백
  assertEquals(byId['apiNode'].label, 'API 연동')
  assertEquals(byId['apiNode'].kindKo, 'API 연동')
  // esd 노드: label 미지정 → TYPE_KO['esd'] 폴백
  assertEquals(byId['esdNode'].label, '기록 저장')
  assertEquals(byId['esdNode'].kindKo, '기록 저장')
})

// ── null/빈 입력 방어 ──────────────────────────────────────────

Deno.test('deriveStructure: null 입력 → 빈 결과', () => {
  const r = deriveStructure(null)
  assertEquals(r.scenarios.length, 0)
  assertEquals(r.nodes.length, 0)
  assertEquals(r.edges.length, 0)
  assertEquals(r.loops.length, 0)
})

Deno.test('deriveUserFlow: null 입력 → 빈 결과', () => {
  const r = deriveUserFlow(null)
  assertEquals(r.scenarios.length, 0)
})

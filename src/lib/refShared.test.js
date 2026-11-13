import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { TYPE_KO, walk, firstOutputText, getBoilerAndRoots } from './refShared.js'

// ── 재복제 방지: refDiagram.js·refSummary.js가 refShared.js를 import하고
//    TYPE_KO/walk/firstOutputText/getBoilerAndRoots를 로컬로 재정의하지 않는지 정적으로 확인한다.
//    선례: resultBundle/noRawBundleReads.test.js — 같은 스타일(테스트 파일 기준 경로, 주석 제거 후 검사)을 따른다.

const LIB_DIR = new URL('.', import.meta.url).pathname
const SHARED_NAMES = ['TYPE_KO', 'walk', 'firstOutputText', 'getBoilerAndRoots']
const CONSUMERS = ['refDiagram.js', 'refSummary.js']

/**
 * 주석을 지운 소스를 돌려준다 — 설명문에 이름이 나오는 것은 위반이 아니다.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')   // 블록 주석
    .replace(/^\s*\/\/.*$/gm, '')        // 줄 주석
}

Deno.test('refDiagram.js·refSummary.js는 refShared.js에서 import하고 로컬 재정의하지 않는다', async () => {
  for (const name of CONSUMERS) {
    const raw = await Deno.readTextFile(`${LIB_DIR}${name}`)
    const src = stripComments(raw)

    // import 확인
    const importsShared = /from\s+['"]\.\/refShared\.js['"]/.test(src)
    assertEquals(importsShared, true, `${name}이 refShared.js를 import하지 않는다`)

    // import 줄을 걷어낸 본문 — 여기서 이름이 쓰이면 refShared.js에서 받아와야 한다.
    // (쓰지도 않는 이름까지 import를 강제하면 죽은 import가 남는다 — 리뷰 지적)
    const body = src.replace(/^\s*import\s[^\n]*$/gm, '')

    for (const shared of SHARED_NAMES) {
      const usedInBody = new RegExp(`\\b${shared}\\b`).test(body)
      if (usedInBody) {
        const importsThisName = new RegExp(
          `import\\s*\\{[^}]*\\b${shared}\\b[^}]*\\}\\s*from\\s*['"]\\./refShared\\.js['"]`,
        ).test(src)
        assertEquals(importsThisName, true, `${name}이 ${shared}를 쓰면서 refShared.js에서 import하지 않는다`)
      }

      // 로컬 재정의 금지 — const/function 선언으로 같은 이름을 다시 만들면 위반
      const localConst = new RegExp(`\\bconst\\s+${shared}\\s*=`).test(src)
      const localFunc = new RegExp(`\\bfunction\\s+${shared}\\s*\\(`).test(src)
      assertEquals(localConst, false, `${name}이 ${shared}를 const로 로컬 재정의한다`)
      assertEquals(localFunc, false, `${name}이 ${shared}를 function으로 로컬 재정의한다`)
    }
  }
})

Deno.test('refShared.js 자체가 존재한다 (죽은 대상 방지)', async () => {
  const stat = await Deno.stat(`${LIB_DIR}refShared.js`).catch(() => null)
  assertEquals(stat !== null, true, 'refShared.js가 없다')
})

// ── walk: includeBody 차이 ──────────────────────────────────────

const walkFlow = {
  nodes: [
    { id: 'a', then: ['b'], body: ['x'] },
    { id: 'b', then: [], body: [] },
    { id: 'x', then: ['y'], body: [] },
    { id: 'y', then: [], body: [] },
  ],
}
const byIdWalk = new Map(walkFlow.nodes.map((n) => [n.id, n]))

Deno.test('walk: includeBody=false면 then만 따라간다(body 무시)', () => {
  const seen = walk(byIdWalk, ['a'], false)
  assertEquals(seen.has('a'), true)
  assertEquals(seen.has('b'), true, 'then 대상 b는 포함')
  assertEquals(seen.has('x'), false, 'body 대상 x는 미포함')
  assertEquals(seen.has('y'), false)
})

Deno.test('walk: includeBody=true면 then과 body를 모두 따라간다', () => {
  const seen = walk(byIdWalk, ['a'], true)
  assertEquals(seen.has('a'), true)
  assertEquals(seen.has('b'), true)
  assertEquals(seen.has('x'), true, 'body 대상 x 포함')
  assertEquals(seen.has('y'), true, 'x의 then까지 전이 확장')
})

Deno.test('walk: 존재하지 않는 시작 id·중복은 안전하게 무시된다', () => {
  const seen = walk(byIdWalk, ['nope', 'a', 'a'], true)
  assertEquals(seen.has('nope'), false)
  assertEquals([...seen].sort(), ['a', 'b', 'x', 'y'])
})

// ── firstOutputText ──────────────────────────────────────────────

Deno.test('firstOutputText: text 항목의 첫 texts[0]를 돌려준다', () => {
  const node = { config: { items: [{ type: 'text', text: [{ texts: ['안녕하세요'] }] }] } }
  assertEquals(firstOutputText(node), '안녕하세요')
})

Deno.test('firstOutputText: text 타입이 아닌 항목은 건너뛴다', () => {
  const node = { config: { items: [{ type: 'button' }, { type: 'text', text: [{ texts: ['본문'] }] }] } }
  assertEquals(firstOutputText(node), '본문')
})

Deno.test('firstOutputText: 텍스트가 없으면 빈 문자열', () => {
  assertEquals(firstOutputText({ config: { items: [] } }), '')
  assertEquals(firstOutputText({}), '')
  assertEquals(firstOutputText(null), '')
  assertEquals(firstOutputText({ config: { items: [{ type: 'text' }] } }), '')
})

// ── getBoilerAndRoots ──────────────────────────────────────────────

const boilerFlow = {
  nodes: [
    { id: 'w', type: 'greeting', then: ['greet'] },
    { id: 'greet', type: 'output', then: [] },
    { id: 'root1', type: 'output', then: [] },
    { id: 'fallback', type: 'fallback', then: ['bye'] },
    { id: 'bye', type: 'output', then: [] },
  ],
}
const byIdBoiler = new Map(boilerFlow.nodes.map((n) => [n.id, n]))

Deno.test('getBoilerAndRoots: type이 greeting/fallback인 노드를 boiler 서브트리로 식별', () => {
  const { boiler, roots } = getBoilerAndRoots(byIdBoiler, ['w', 'root1', 'fallback'])
  assertEquals(boiler.has('w'), true)
  assertEquals(boiler.has('greet'), true, 'greeting의 then 자식도 boiler')
  assertEquals(boiler.has('fallback'), true)
  assertEquals(boiler.has('bye'), true, 'fallback의 then 자식도 boiler')
  assertEquals(boiler.has('root1'), false)
  assertEquals(roots, ['root1'])
})

Deno.test("getBoilerAndRoots: fallback는 type뿐 아니라 id==='fallback'로도 식별된다", () => {
  const byId = new Map([
    ['root1', { id: 'root1', type: 'output', then: [] }],
    ['fallback', { id: 'fallback', type: 'node', then: [] }], // type은 다르지만 id로 식별
  ])
  const { boiler, roots } = getBoilerAndRoots(byId, ['root1', 'fallback'])
  assertEquals(boiler.has('fallback'), true)
  assertEquals(roots, ['root1'])
})

Deno.test('getBoilerAndRoots: greeting·fallback가 없으면 roots는 mainThen 그대로', () => {
  const byId = new Map([['a', { id: 'a', type: 'output', then: [] }]])
  const { boiler, roots } = getBoilerAndRoots(byId, ['a'])
  assertEquals(boiler.size, 0)
  assertEquals(roots, ['a'])
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { nodeTypeInfo, isEditableType, NODE_TYPES, editableTypes } from './nodeTypeRegistry.js'

Deno.test('편집 가능 타입은 editor를 갖는다', () => {
  for (const t of ['output', 'set', 'esd', 'api', 'llmchat', 'node', 'subflow']) {
    const info = nodeTypeInfo(t)
    assertEquals(info.editable, true, `${t}가 편집 가능해야 한다`)
    assertEquals(typeof info.editor, 'string')
  }
})

Deno.test('등록되지 않은 타입은 편집 불가 (화이트리스트)', () => {
  // 솔루션이 쓰지만 생성기가 만들지 않는 타입 — 라벨은 있어도 편집은 막힌다.
  for (const t of ['carousel', 'locationpicker', 'weather', 'zzz_존재하지않는타입']) {
    assertEquals(nodeTypeInfo(t).editable, false, `${t}는 잠겨야 한다`)
    assertEquals(nodeTypeInfo(t).editor, null)
  }
})

Deno.test('빈 값·비문자열도 throw 없이 잠금으로 떨어진다', () => {
  for (const t of ['', null, undefined, 0, {}, []]) {
    const info = nodeTypeInfo(t)
    assertEquals(info.editable, false)
    assertEquals(typeof info.label, 'string')
  }
})

Deno.test('알려진 미지 타입은 한글 라벨을 준다(다이어그램 가독성)', () => {
  assertEquals(nodeTypeInfo('postback').label, '버튼')
  assertEquals(nodeTypeInfo('frame').label, '프레임')
  assertEquals(nodeTypeInfo('html').label, 'HTML')
  assertEquals(nodeTypeInfo('carousel').label, '캐러셀')
})

Deno.test('모르는 타입의 label은 타입 문자열 자체', () => {
  assertEquals(nodeTypeInfo('zzz_새타입').label, 'zzz_새타입')
  assertEquals(nodeTypeInfo(null).label, '알 수 없음')
})

Deno.test('isEditableType은 nodeTypeInfo().editable과 항상 일치', () => {
  const samples = ['output', 'set', 'postback', 'carousel', '', null, 'zzz', 'context.type ? x : "b"']
  for (const t of samples) assertEquals(isEditableType(t), nodeTypeInfo(t).editable, String(t))
})

Deno.test('editableTypes()는 editable:true인 것만, 정렬되어 반환', () => {
  const list = editableTypes()
  assertEquals(list.every((t) => NODE_TYPES[t].editable === true), true)
  assertEquals([...list].sort().join(','), list.join(','))
})

Deno.test('레지스트리 항목은 label을 반드시 갖는다', () => {
  for (const [t, v] of Object.entries(NODE_TYPES)) {
    assertEquals(typeof v.label, 'string', `${t}에 label이 없다`)
    assertEquals(v.label.length > 0, true, `${t}의 label이 비었다`)
    if (v.editable) assertEquals(typeof v.editor, 'string', `${t}는 editable인데 editor가 없다`)
  }
})

// ── 실제 봇 fixture 대조 ────────────────────────────────────────────────

function collectTypes(json) {
  const c = new Map()
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n && typeof n === 'object') {
      if (typeof n.type === 'string') c.set(n.type, (c.get(n.type) || 0) + 1)
      Object.values(n).forEach(walk)
    }
  }
  walk(json)
  return c
}

const FIXTURES = ['node-sample', 'llm-sample']
async function loadFixture(name) {
  return JSON.parse(await Deno.readTextFile(`docs/superpowers/fixtures/bots/${name}.json`))
}

Deno.test('fixture의 모든 타입이 throw 없이 처리되고 label을 갖는다', async () => {
  for (const f of FIXTURES) {
    for (const t of collectTypes(await loadFixture(f)).keys()) {
      const info = nodeTypeInfo(t)
      assertEquals(typeof info.label, 'string', `${f}: ${t}`)
      assertEquals(info.label.length > 0, true, `${f}: ${t} label이 비었다`)
      assertEquals(typeof info.editable, 'boolean', `${f}: ${t}`)
    }
  }
})

Deno.test('fixture에 편집 가능으로 열린 노드 타입은 8종뿐', async () => {
  // 새 타입을 **실수로** editable로 열면 여기서 걸린다 — 편집기 없이 열리면 무손실이 깨진다.
  // 의도적으로 열 때만 이 목록을 갱신한다.
  //   기본 7종  api·esd·llmchat·node·output·set·subflow
  //   2026-08-28 추가  stack(실사용 18회) — 사용자 요청
  //   ⚠ component·docquery는 열지 않는다: 솔루션에 저장된 자원을 참조한다
  //      (component.dialogId · docquery.storeId). 고치면 없는 자원을 가리키게 된다.
  const opened = new Set()
  for (const f of FIXTURES) {
    for (const [t] of nodeLevelTypes(await loadFixture(f))) {
      if (isEditableType(t)) opened.add(t)
    }
  }
  assertEquals([...opened].sort(),
    ['api', 'esd', 'llmchat', 'node', 'output', 'set', 'stack', 'subflow'])
})

Deno.test('솔루션 저장 자원을 참조하는 노드는 잠긴 채로 남는다', () => {
  // 고치면 존재하지 않는 자원을 가리키게 되고, 다시 업로드하는 순간 봇이 깨진다.
  // 생성기는 참조 가능한 목록을 알 방법이 없어 검증도 못 한다(2026-08-28 사용자 확인).
  for (const t of ['component', 'docquery', 'agent', 'campaign']) {
    assertEquals(isEditableType(t), false, `${t}가 열렸다`)
    assertEquals(nodeTypeInfo(t).label.includes('솔루션'), true, `${t} 라벨에 이유가 없다`)
  }
})

/** 노드 레벨 타입만 센다 — config 항목의 type과 섞으면 안 된다. */
function nodeLevelTypes(flow) {
  const c = new Map()
  const bump = (t) => { if (typeof t === 'string' && t) c.set(t, (c.get(t) || 0) + 1) }
  for (const d of flow?.dialogs || []) {
    for (const n of d?.nodes || []) {
      bump(n?.type)
      for (const b of n?.body || []) if (b && typeof b === 'object') bump(b.type)
    }
  }
  return c
}

Deno.test('팔레트(LEGEND_ITEMS)에 노출되는 타입은 전부 편집 가능해야 한다', async () => {
  // 팔레트로 추가한 노드는 반드시 편집기가 있어야 한다 — 없으면 추가하고 내용을 못 채운다.
  const src = await Deno.readTextFile('src/components/flow/FlowCanvas.jsx')
  const block = src.slice(src.indexOf('const LEGEND_ITEMS'), src.indexOf(']', src.indexOf('const LEGEND_ITEMS')))
  const types = [...block.matchAll(/type:\s*'([^']+)'/g)].map((m) => m[1])
  assertEquals(types.length > 0, true, 'LEGEND_ITEMS를 읽지 못했다')
  for (const t of types) assertEquals(isEditableType(t), true, `팔레트의 ${t}가 편집 불가다`)
})

Deno.test('NodeEditor가 렌더하는 case 목록이 레지스트리 편집 가능 타입을 벗어나지 않는다', async () => {
  const src = await Deno.readTextFile('src/components/flow/NodeEditor.jsx')
  const cases = [...src.matchAll(/case '([a-z]+)':/g)].map((m) => m[1])
  const extra = cases.filter((t) => !isEditableType(t) && t !== 'condition')
  assertEquals(extra, [], `레지스트리에 없는데 편집기가 있는 타입: ${extra.join(', ')}`)
})

Deno.test('group은 기능이 없어 열지 않는다 — 이름만으로 충분하다', () => {
  // 라벨 입력은 타입별 필드 바깥에 있어 **잠긴 노드도 이름은 항상 편집된다**.
  assertEquals(isEditableType('group'), false)
  assertEquals(nodeTypeInfo('group').label, '그룹(화면 묶음)')
})

Deno.test('task는 편집 대상에서 제외 (2026-08-28 사용자 지시)', () => {
  assertEquals(isEditableType('task'), false)
})

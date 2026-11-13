import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildRepeatVarSet, wrapCollectionLoops } from "./wrapCollectionLoops.ts"
import { DEFAULT_LOOP_BEHAVIOR } from "./loopBehavior.ts"

const main = (j: any) => j.dialogs.find((d: any) => d.id === "main")
const byId = (j: any, id: string) => main(j).nodes.find((n: any) => n.id === id)

// ask(output) → save(set input.text) → done(output)
function makeJson() {
  return {
    dialogs: [
      { id: "predialog", nodes: [] },
      {
        id: "main", then: ["ask_menu", "fallback"],
        nodes: [
          { id: "ask_menu", type: "output", label: "메뉴 요청", then: ["save_menu"],
            config: { items: [{ type: "text", text: [{ condition: "", texts: ["메뉴를 말씀해 주세요."] }] }] } },
          { id: "save_menu", type: "set", label: "메뉴 저장", then: ["done"],
            config: { items: [{ key: "local.menu", value: "input.text", condition: "" }] } },
          { id: "done", type: "output", label: "완료", then: [], config: { items: [{ type: "text", text: [{ condition: "", texts: ["접수됨"] }] }] } },
          { id: "fallback", type: "fallback", then: [] },
        ],
      },
      { id: "postdialog", nodes: [] },
    ],
  }
}

Deno.test("buildRepeatVarSet: '여러 개 입력'=예 항목만 추출(변수명 우선·항목명 폴백)", () => {
  const responses = {
    q: [{ "수집 정보": [
      { "항목명": "메뉴", "변수명": "menu", "입력 형식": "자유텍스트", "여러 개 입력": "예" },
      { "항목명": "연락처", "변수명": "phone", "입력 형식": "숫자", "여러 개 입력": "아니오" },
      { "항목명": "옵션", "변수명": "", "입력 형식": "자유텍스트", "여러 개 입력": "예" },
    ] }],
  }
  const s = buildRepeatVarSet(responses)
  assert(s.has("menu"))
  assert(!s.has("phone"))
  assert(s.has("옵션"))  // 변수명 비면 항목명
})

Deno.test("반복 수집 항목이 수집 루프로 감싸진다 — 누적 concat + 종료 분기 + flag/배열 init", () => {
  const j = makeJson()
  const { wrapped } = wrapCollectionLoops(j, new Set(["menu"]), DEFAULT_LOOP_BEHAVIOR)
  assertEquals(wrapped, 1)

  const sub = main(j).nodes.find((n: any) => n.type === "subflow")
  assert(sub, "수집 subflow 생성")
  assertEquals(sub.body, ["ask_menu"])
  assertEquals(sub.then, ["done"])                               // continuation 보존
  assertEquals(sub.config.loop.condition, "context.menuDone")    // boolean flag(기본 truthy)

  // ask → [stop, acc] 분기
  assertEquals(byId(j, "ask_menu").then, ["save_menu__stop", "save_menu"])
  // 누적 노드(기존 save 재사용): concat + '그만 아님' 조건
  const acc = byId(j, "save_menu")
  assertEquals(acc.condition, "input.text.includes('그만') == false")
  assertEquals(acc.config.items[0].value, "local.menu.concat([input.text])")
  assertEquals(acc.then, [])
  // 종료 노드: '그만'이면 flag=true
  const stop = byId(j, "save_menu__stop")
  assertEquals(stop.condition, "input.text.includes('그만')")
  assertEquals(stop.config.items[0].key, "context.menuDone")
  assertEquals(stop.config.items[0].value, "true")
  assertEquals(stop.then, [])

  // init: flag=false + 배열=[]
  const init = byId(j, "save_menu__collectinit")
  assert(init, "init 생성")
  assertEquals(init.then, [sub.id])
  const keys = init.config.items.map((it: any) => `${it.key}=${it.value}`)
  assert(keys.includes("context.menuDone=false"))
  assert(keys.includes("local.menu=[]"))
  // 루트/부모 재배선: ask_menu → init
  assert(main(j).then.includes(init.id))
  assert(!main(j).then.includes("ask_menu"))
})

Deno.test("반복 플래그 없는 항목은 감싸지 않는다", () => {
  const j = makeJson()
  const { wrapped } = wrapCollectionLoops(j, new Set(["phone"]), DEFAULT_LOOP_BEHAVIOR)
  assertEquals(wrapped, 0)
  assertEquals(main(j).nodes.some((n: any) => n.type === "subflow"), false)
})

Deno.test("멱등: 두 번 돌려도 한 번만 감싼다", () => {
  const j = makeJson()
  wrapCollectionLoops(j, new Set(["menu"]), DEFAULT_LOOP_BEHAVIOR)
  const { wrapped } = wrapCollectionLoops(j, new Set(["menu"]), DEFAULT_LOOP_BEHAVIOR)
  assertEquals(wrapped, 0)
  assertEquals(main(j).nodes.filter((n: any) => n.type === "subflow").length, 1)
})

// LLM이 규칙을 어기고 직접 count 루프를 만든 경우: 기존 루프를 제자리 정규화.
function makeJsonWithLoop() {
  return {
    dialogs: [
      { id: "main", then: ["loop1__init", "fallback"], nodes: [
        { id: "loop1__init", type: "set", then: ["loop1"], config: { items: [{ key: "context.done", value: "false", condition: "" }] } },
        { id: "loop1", type: "subflow", body: ["ask_menu"], then: ["done"], config: { loop: { condition: "context.done", count: "10" } } },
        { id: "ask_menu", type: "output", label: "메뉴 요청", then: ["save_menu"], config: { items: [{ type: "text", text: [{ condition: "", texts: ["메뉴를 말씀해 주세요."] }] }] } },
        { id: "save_menu", type: "set", label: "메뉴 저장", then: [], config: { items: [{ key: "local.menu", value: "input.text", condition: "" }] } },
        { id: "done", type: "output", then: [], config: { items: [] } },
        { id: "fallback", type: "fallback", then: [] },
      ] },
    ],
  }
}

Deno.test("LLM이 만든 기존 count 루프를 제자리 정규화(누적 + 종료 분기), 새 subflow 안 만듦", () => {
  const j = makeJsonWithLoop()
  const { wrapped } = wrapCollectionLoops(j, new Set(["menu"]), DEFAULT_LOOP_BEHAVIOR)
  assertEquals(wrapped, 1)
  // 기존 loop1 그대로 사용(새 subflow 추가 안 함)
  assertEquals(main(j).nodes.filter((n: any) => n.type === "subflow").length, 1)
  assertEquals(byId(j, "loop1").body, ["ask_menu"])
  // ask → [stop, acc]
  assertEquals(byId(j, "ask_menu").then, ["save_menu__stop", "save_menu"])
  // 누적 + 종료 분기, 기존 exitVar(context.done) 사용
  assertEquals(byId(j, "save_menu").config.items[0].value, "local.menu.concat([input.text])")
  assertEquals(byId(j, "save_menu").condition, "input.text.includes('그만') == false")
  assertEquals(byId(j, "save_menu__stop").config.items[0].key, "context.done")
  assertEquals(byId(j, "save_menu__stop").config.items[0].value, "true")
})

Deno.test("exitCompare '== true' 모드면 조건도 그에 맞춘다", () => {
  const j = makeJson()
  wrapCollectionLoops(j, new Set(["menu"]), { ...DEFAULT_LOOP_BEHAVIOR, exitCompare: "== true" })
  const sub = main(j).nodes.find((n: any) => n.type === "subflow")
  assertEquals(sub.config.loop.condition, "context.menuDone == true")
})

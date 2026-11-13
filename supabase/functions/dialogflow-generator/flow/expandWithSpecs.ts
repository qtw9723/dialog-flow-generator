import { FlowSpec } from "./types.ts"
import { LoopBehavior, DEFAULT_LOOP_BEHAVIOR, exitCondition } from "./loopBehavior.ts"

// 파생된 노드 스펙(derive-node-specs 산출, basic_rules.nodeSpecs에 저장)
interface SlotLite {
  path: string; kind: string; options?: string[]; default?: unknown; source?: string
  discriminator?: string
  variants?: Record<string, { example?: any; slots?: SlotLite[] }>
}
export interface NodeSpecLite {
  type: string
  example: any
  isTerminal?: boolean
  summary?: string
  slots?: SlotLite[]
}

// 토큰명 + 슬롯으로 placeholder 값을 결정론적으로 해석
function makeResolver(flowNode: { id: string; intent: string; type: string }, slots: SlotLite[]) {
  return (token: string): unknown => {
    const t = token.toLowerCase()
    if (t.includes("id")) return flowNode.id
    if (t.includes("label")) return flowNode.intent || flowNode.type
    if (t.includes("text")) return flowNode.intent || ""
    // 토큰명이 슬롯 path의 마지막 세그먼트와 겹치면 그 슬롯의 default/첫 옵션 사용 (closed-world)
    const slot = slots.find((s) => {
      const seg = (s.path.split(/[.\[\]]/).filter(Boolean).pop() || "").toLowerCase()
      return seg && (seg.includes(t) || t.includes(seg))
    })
    if (slot) return slot.default ?? (slot.options && slot.options[0]) ?? ""
    return ""
  }
}

function substitute(str: string, resolve: (t: string) => unknown): unknown {
  const whole = str.match(/^\{\{(.+?)\}\}$/)
  if (whole) return resolve(whole[1])            // 값 전체가 placeholder → 실제 타입 값 허용
  return str.replace(/\{\{(.+?)\}\}/g, (_, tok) => String(resolve(tok)))  // 문자열 내 인라인
}

function fillPlaceholders(obj: any, resolve: (t: string) => unknown): void {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === "string") obj[i] = substitute(obj[i], resolve)
      else fillPlaceholders(obj[i], resolve)
    }
    return
  }
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === "string") obj[k] = substitute(obj[k], resolve)
      else fillPlaceholders(obj[k], resolve)
    }
  }
}

// dot-path("config.items")로 값을 설정 (중간 객체 없으면 생성)
function setByPath(obj: any, path: string, value: any): void {
  const keys = path.split(".")
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
}

/**
 * expandFlowWithSpecs (spec 기반): 파생된 노드 스펙의 example 골격을 clone하고 placeholder를 채워
 * 솔루션-유효한 dialogs[].nodes[] 구조를 만든다. 스펙 없는 type은 최소 노드로 폴백.
 * 판별 유니온(array<variant>) 슬롯은 기본 variant 아이템 1개를 그 variant 템플릿으로 생성한다(v1).
 */
export function expandFlowWithSpecs(
  flow: FlowSpec,
  specsByType: Record<string, NodeSpecLite>,
  opts: { name?: string; loopBehavior?: LoopBehavior } = {},
): any {
  const behavior = opts.loopBehavior || DEFAULT_LOOP_BEHAVIOR
  // 루프 본문 진입 노드들: next로 참조되지 않아도 subflow.body로만 도달 → 루트에서 제외해야 함.
  const bodyIds = new Set(flow.nodes.flatMap((n) => n.loop?.body || []))

  const nodes = flow.nodes.map((n) => {
    // 루프 노드 → subflow 결정론적 변환
    if (n.type === "loop" && n.loop) {
      return {
        id: n.id,
        type: "subflow",
        label: n.intent || "반복",
        condition: "",
        config: { loop: { condition: exitCondition(n.loop.exitVar, behavior), count: String(n.loop.max ?? behavior.defaultMax) } },
        body: [...n.loop.body],
        then: [...n.next],
        actions: [],
      }
    }
    const spec = specsByType[n.type]
    if (!spec || spec.example == null) {
      return { id: n.id, type: n.type, label: n.intent || n.type, config: {}, then: [...n.next] }
    }
    const slots = spec.slots || []
    const node = structuredClone(spec.example)
    fillPlaceholders(node, makeResolver(n, slots))

    // 판별 유니온 배열 슬롯: designFlow이 고른 node.variants대로 item들을 생성.
    // 선택이 없으면 기본 1개(text 우선). 선택은 슬롯의 실제 variant로 한정(closed-world).
    for (const slot of slots) {
      if (slot.kind !== "array<variant>" || !slot.variants) continue
      const available = Object.keys(slot.variants)
      if (available.length === 0) continue
      let chosenList = (n.variants || []).filter((v) => available.includes(v))
      if (chosenList.length === 0) chosenList = [available.includes("text") ? "text" : available[0]]
      const items = chosenList
        .map((vt) => {
          const variant = slot.variants![vt]
          if (!variant || variant.example == null) return null
          const item = structuredClone(variant.example)
          fillPlaceholders(item, makeResolver(n, variant.slots || []))
          return item
        })
        .filter((x) => x !== null)
      if (items.length) setByPath(node, slot.path, items)
    }

    node.id = n.id          // 연결 안정성을 위해 flow id로 확정
    node.then = [...n.next]  // 연결 = next
    // label은 사용자에게 노출되는 "이 노드의 기능 한 줄 설명"이다.
    // 스펙 example의 제네릭 라벨("셋","그룹","ESD"…) 대신 designFlow이 설계한 intent로 항상 덮어쓴다.
    if (n.intent) node.label = n.intent
    return node
  })

  // autoInitFlag: 각 루프 진입 전 exitVar=false set 주입(루프를 then으로 가리켜 루트 자리 인계).
  const initNodes: any[] = []
  const initByLoop = new Map<string, string>()
  if (behavior.autoInitFlag) {
    for (const n of flow.nodes) {
      if (n.type === "loop" && n.loop && n.loop.exitVar) {
        const initId = `${n.id}__init`
        initByLoop.set(n.id, initId)
        initNodes.push({
          id: initId,
          type: "set",
          label: `${n.loop.exitVar} 초기화`,
          condition: "",
          config: { items: [{ key: n.loop.exitVar, value: "false", condition: "" }] },
          then: [n.id],
          actions: [],
        })
      }
    }
  }

  // init이 루프의 '단일 부모'가 되도록, 루프를 then으로 가리키던 기존 참조를 init으로 재배선한다.
  // (루프가 비루트일 때 — 예: 어떤 노드가 next로 루프를 가리킬 때 — init 주입이 부모를 2개로 만들면
  //  트리 빌드가 깨진다. init만 루프를 가리키게 해 트리 불변식을 지킨다. init 노드 자신은 제외.)
  const redirect = (then: string[] | undefined) => (then || []).map((id) => initByLoop.get(id) ?? id)
  const reNodes = initByLoop.size === 0 ? nodes : nodes.map((n: any) => ({ ...n, then: redirect(n.then) }))

  // 루트 = (init 포함) 어떤 노드의 then으로도 참조되지 않고, 루프 본문 진입도 아닌 노드.
  // dialog.then에는 '루트 노드'만 넣는다. DialogFlow는 평면 nodes[] + node.then(자식 id)으로 트리를 표현하며,
  // dialog.then은 엔트리 목록일 뿐이다(전 노드를 넣으면 뎁스가 사라짐).
  const allExpanded = [...reNodes, ...initNodes]
  const targeted = new Set(allExpanded.flatMap((n: any) => n.then || []))
  const rootIds = allExpanded.map((n: any) => n.id).filter((id: string) => !targeted.has(id) && !bodyIds.has(id))
  const orderedIds = rootIds.includes(flow.entry)
    ? [flow.entry, ...rootIds.filter((id: string) => id !== flow.entry)]
    : (rootIds.length > 0 ? rootIds : [flow.entry])

  // Main 마지막에 Fallback(매칭 안 된 입력의 fallback)를 항상 둔다. 자식 output 하나 포함.
  const aeNodes = makeFallbackNodes()
  const mainNodes = [...reNodes, ...initNodes, ...aeNodes]
  const mainThen = [...orderedIds, "fallback"]   // fallback는 맨 마지막 루트

  const dialogs = [makePreDialog(), { id: "main", name: "Main Dialog", then: mainThen, nodes: mainNodes }, makePostDialog()]
  // 결정론적 안전장치: 어떤 레퍼런스 spec.example이 hideInput:true를 박아 둬도(예: '샘플 레스토랑'),
  // output 노드는 사용자 입력을 받아야 하므로 입력을 막지 않는다(hideInput=false 강제). 규칙 아닌 구조 불변식 → 코드 유지.
  for (const dialog of dialogs) for (const node of (dialog.nodes || [])) enforceInputNotBlocked(node)

  return {
    id: "generated-id",
    name: opts.name || "name-from-mapping",
    // DialogFlow 솔루션은 Main과 같은 레벨에 Pre/Post Dialog가 항상 있어야 한다(고정 보일러플레이트).
    dialogs,
  }
}

// output 노드는 입력창을 가리면 안 된다(가리면 챗봇이 사용자 발화를 못 받아 멈춤). hideInput을 항상 false로 강제.
function enforceInputNotBlocked(node: any): void {
  if (!node || node.type !== "output") return
  node.config = { ...(node.config || {}), hideInput: false }
}

// Fallback: 어떤 분기에도 안 걸린 입력의 fallback. 자식 output 하나(레퍼런스 값 기반 안내).
function makeFallbackNodes(): any[] {
  return [
    { id: "fallback", type: "fallback", label: "Fallback", body: [], then: ["fallback_out"], actions: [] },
    {
      id: "fallback_out",
      type: "output",
      label: "안내",
      condition: "",
      body: [],
      then: [],
      config: {
        items: [
          {
            type: "text",
            condition: "",
            channels: [{ name: "Web", use: true }],
            text: [{ condition: "", texts: ["잘 못 알아들었어요!"] }],
          },
        ],
        waitInput: false,
      },
    },
  ]
}

// Pre Dialog: Main 이전에 실행되는 자리(placeholder). 구조상 항상 존재해야 한다.
function makePreDialog(): any {
  return { id: "predialog", name: "Pre Dialog", body: [], then: [], nodes: [], config: {} }
}

// Post Dialog: 에러 처리(_error) 등 공통 후처리. 구조상 항상 존재해야 한다.
function makePostDialog(): any {
  return {
    id: "postdialog",
    name: "Post Dialog",
    body: [],
    then: ["error"],
    config: {},
    nodes: [
      {
        id: "error",
        type: "output",
        label: "에러 메시지",
        condition: "_error",
        config: {
          items: [
            {
              type: "text",
              condition: "",
              channels: [{ name: "Web", use: true }],
              text: [{ condition: "", texts: ["에러가 발생했습니다.\n- ${_error}"] }],
            },
          ],
          waitInput: false,
        },
      },
    ],
  }
}

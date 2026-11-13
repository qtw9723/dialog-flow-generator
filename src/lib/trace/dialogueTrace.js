// 결정론 대화 추적기 (순수) — 생성된 대화 흐름을 규칙 기반으로 따라가며 검사한다.
//
// 생성기 머신 다이얼로그 봇을 사용자 턴 목록과 가짜 응답(stub)으로 한 턴씩 돌려 사건(event) 목록을 낸다.
// LLM·네트워크를 부르지 않고 봇을 고치지 않는다. **근거 있는 실행 규칙만 흉내 낸다** — 규칙 밖에 닿으면
// `unknown` 사건을 내고 그 자리에서 멈추며, 이후 턴은 모두 `halted-earlier`다. 추측으로 pass를 만들지 않는다.
//
// 실행 규칙과 근거:
//   - 조건이 비면(공백뿐 포함) 참. 형제는 적힌 순서로 보고 처음 맞은 노드에서 멈춘다.   [V2 Craft 사용자 확정 ADR]
//   - output이 나가면 그 턴은 끝난다. 다음 입력은 그 output의 then부터 찾고, 맞는 게 없으면 루트부터.
//                                                               [매뉴얼 output_stops·main.search + 2026-10-26 솔루션 확인]
//   - output 다음 턴의 입력 글자는 input.text다(확인 봇: [2] 뒤 입력이 [3]에 그대로 찍힘).   [2026-10-26 솔루션 확인]
//   - 처리 순서 Pre → Main → Post. Pre에서 output이 나가면 Main을 건너뛴다. Post는 매 턴 루트부터. [매뉴얼]
//   - 노드 실행 중 에러(외부 호출 실패)면 Main을 멈추고 Post로 가며 _error에 담긴다. 다음 입력은 루트부터. [매뉴얼]
//   - _greeting은 세션 시작 턴에만 참. local은 루트에서 갈리는 흐름 단위로 새로 시작, context는 세션 내내.  [매뉴얼]
//   - _result는 직전 외부 호출 결과. 한 턴 노드 처리 한도 50.                                       [매뉴얼]
//   - subflow(반복 아님): body가 먼저, body에서 output이 나가면 다음 턴은 subflow의 then.       [V2 Craft 관측]
//   - subflow 반복(loop.count·condition): 본문 output 뒤 입력은 본문 사슬로 이어지고, 본문 사슬이 끝나면 중단
//     조건 참 → 같은 턴에 then / 거짓 → 회차+1, count에 닿으면 then, 아니면 같은 턴에 본문 재실행. _loopCount는 0부터.
//                                                               [2026-10-26 솔루션 확인 — 반복-확인봇]
//
// 판정 불가(unknown)로 두는 것 — 근거가 아직 없다:
//   버튼(postback 항목)·llmchat·docquery·agent·component·stack 등 미지원 노드,
//   멘트 `${…}` 안의 함수 호출·객체/배열·null/undefined 출력, 정의되지 않은 이름, 값 읽기 중 오류.
//
// 표현식 평가: 조건·값 칸은 런타임에서 자바스크립트로 돈다. 여기서는 허용한 이름만 보이는 범위로 평가한다.
// ⚠ 보안 경계가 아니다 — 우리 생성기·평가셋이 만든 봇을 개발 도구로 돌리는 용도다. 위험 키워드는 미리 거른다.

export const NODE_LIMIT = 50

class Unknown extends Error {
  constructor(reason, nodeId) {
    super(reason)
    this.reason = reason
    this.nodeId = nodeId
  }
}

const FORBIDDEN = /\b(constructor|__proto__|prototype|import|eval|Function|globalThis|window|self|Deno|require|process|fetch)\b/
const condOf = (n) => String(n?.condition ?? n?.config?.condition ?? '').trim()
const isCommentOnly = (c) => c.split('\n').every((line) => !line.trim() || line.trim().startsWith('//'))

const lodashLite = {
  isEmpty: (v) => v == null || (typeof v === 'object' ? Object.keys(v).length === 0 : String(v).length === 0),
  isNil: (v) => v == null,
}

function evaluate(expr, scope, nodeId) {
  if (FORBIDDEN.test(expr)) throw new Unknown('forbidden-expression', nodeId)
  let fn
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('__s', `with (__s) { return (${expr}\n) }`)
  } catch {
    throw new Unknown('syntax-error', nodeId)
  }
  // has()가 늘 참이라 모든 이름 조회가 이 범위로 온다 — 전역(Deno·fetch 등)이 보이지 않는다.
  const proxy = new Proxy(scope, {
    has: () => true,
    get(t, k) {
      if (k === Symbol.unscopables) return undefined
      if (k in t) return t[k]
      throw new Unknown(`undefined-name:${String(k)}`, nodeId)
    },
  })
  try {
    return fn(proxy)
  } catch (e) {
    if (e instanceof Unknown) throw e
    throw new Unknown(`eval-error:${e?.message || e}`, nodeId)
  }
}

function assignPath(state, key, value, nodeId) {
  const m = /^(local|context)\.([A-Za-z_가-힣][\w가-힣]*)$/.exec(String(key || '').trim())
  if (!m) throw new Unknown(`unsupported-set-key:${key}`, nodeId)
  state[m[1]][m[2]] = value
}

function renderTemplate(text, scope, nodeId) {
  return String(text).replace(/\$\{([^}]*)\}/g, (_, expr) => {
    if (/[A-Za-z_$\]][\s]*\(/.test(expr)) throw new Unknown('function-in-template', nodeId)
    const v = evaluate(expr, scope, nodeId)
    if (v == null) throw new Unknown('nullish-in-template', nodeId)
    if (typeof v === 'object') throw new Unknown('object-in-template', nodeId)
    return String(v)
  })
}

/** text 항목의 후보 문구들 — `["…"]` 또는 `[{texts:["…"], condition?}]`. 런타임은 후보 중 하나를 낸다.
 *  묶음마다 붙은 condition(예: `_loopCount < 1`)이 거짓이면 그 묶음은 후보가 아니다. */
function textCandidates(item, scope, nodeId) {
  return (item?.text || []).flatMap((t) => {
    if (typeof t === 'string') return [t]
    const c = String(t?.condition ?? '').trim()
    if (c && !evaluate(c, scope, nodeId)) return []
    return Array.isArray(t?.texts) ? t.texts : []
  })
}

/**
 * @param {object} bot - 머신 다이얼로그 봇
 * @param {{turns: Array<{start?: boolean, intent?: string, text?: string}>,
 *          stubs?: Record<string, {outcome: 'success'|'empty'|'error', response?: any} | Array<object>>}} spec
 * @returns {{status: 'ok'|'unknown', turns: Array<{events: Array<object>}>}}
 *   사건: output{nodeId,texts} · call{nodeId,kind,resource,op,args} · awaitInput{nodeId} · end · unknown{reason,nodeId}
 */
export function traceDialogue(bot, { turns = [], stubs = {} } = {}) {
  const dialogs = new Map((bot?.dialogs || []).map((d) => [d.id, d]))
  const byId = new Map()
  for (const d of dialogs.values()) for (const n of (d.nodes || [])) byId.set(n.id, n)

  const state = { context: {}, local: {}, resume: null, halted: false, callIndex: {} }
  const out = []

  for (const turn of turns) {
    if (state.halted) {
      out.push({ events: [{ type: 'unknown', reason: 'halted-earlier' }] })
      continue
    }
    const events = []
    try {
      runTurn(turn, events)
    } catch (e) {
      if (!(e instanceof Unknown)) throw e
      events.push({ type: 'unknown', reason: e.reason, nodeId: e.nodeId })
      state.halted = true
    }
    out.push({ events })
  }
  return { status: state.halted ? 'unknown' : 'ok', turns: out }

  // ───────────────────────── 턴 ─────────────────────────
  function runTurn(turn, events) {
    if (turn.button !== undefined) throw new Unknown('button-turn-unsupported')
    if (turn.start) {
      state.context = {}
      state.local = {}
      state.resume = null
    }
    const vars = {
      _greeting: !!turn.start, _postback: undefined, _error: undefined, _result: undefined, _loopCount: undefined,
      input: { text: String(turn.text ?? '') }, intentName: turn.intent ?? null,
    }
    const ctx = { vars, events, count: 0, produced: false, errored: false }

    // Pre — 매 턴 루트부터. output이 나가면 Main을 건너뛴다.
    const pre = dialogs.get('predialog')
    runRoots(pre, ctx, { isMain: false })
    if (!ctx.produced) {
      const main = dialogs.get('main')
      const resumed = state.resume && enterChildren(state.resume, ctx)
      if (!resumed && !ctx.errored) {
        state.local = {} // 루트에서 새 흐름 — local은 흐름 단위
        state.resume = null
        runRoots(main, ctx, { isMain: true })
      }
    }
    // Post — 매 턴 루트부터(에러 처리 등). output은 Main 것과 합쳐진다.
    const mainProduced = ctx.produced
    runRoots(dialogs.get('postdialog'), ctx, { isMain: false })

    if (ctx.errored) state.resume = null
    if (mainProduced && state.resume) events.push({ type: 'awaitInput', nodeId: state.resume.from })
    else {
      state.resume = null
      events.push({ type: 'end' })
    }
  }

  function scopeOf(ctx) {
    const v = ctx.vars
    return {
      local: state.local, context: state.context, input: v.input,
      _greeting: v._greeting, _postback: v._postback, _error: v._error, _result: v._result, _loopCount: v._loopCount,
      intent: (name) => v.intentName != null && v.intentName === name,
      _: lodashLite, Number, String, parseInt, parseFloat, isNaN, Math, JSON,
      undefined, NaN, Infinity,
    }
  }

  function matches(n, ctx) {
    if (!n) return false
    if (n.type === 'fallback') return true
    const c = condOf(n)
    if (!c) return true
    if (isCommentOnly(c)) return false // 주석뿐인 조건 = 일부러 끈 노드
    if (/^<[^>]*>$/.test(c)) throw new Unknown('placeholder-condition', n.id)
    return !!evaluate(c, scopeOf(ctx), n.id)
  }

  function firstMatch(ids, ctx) {
    for (const id of ids || []) {
      const n = byId.get(id)
      if (matches(n, ctx)) return n
    }
    return null
  }

  function runRoots(dialog, ctx, { isMain }) {
    if (!dialog) return
    const n = firstMatch(dialog.then, ctx)
    if (n) drive(n, ctx, { isMain, frame: null })
  }

  /** 이전 턴 output 아래에서 이어가기. 맞는 자식이 없으면 false(루트부터 다시). 반복 안이면 그 반복을 이어 간다. */
  function enterChildren(resume, ctx) {
    if (resume.frame) ctx.vars._loopCount = resume.frame.count
    const n = firstMatch(resume.ids, ctx)
    if (!n) return false
    drive(n, ctx, { isMain: true, frame: resume.frame || null })
    return true
  }

  /** 노드 사슬을 실행한다. 'stop'(output·에러로 턴 종료) 또는 'leaf'(자식 없는 노드에서 끝남). */
  function run(start, ctx, opts) {
    let n = start
    while (n) {
      if (++ctx.count > NODE_LIMIT) throw new Unknown('node-limit', n.id)
      const r = exec(n, ctx, opts)
      if (r === 'stop') return 'stop'
      const kids = n.then || []
      if (!kids.length) return 'leaf'
      const next = firstMatch(kids, ctx)
      if (!next) throw new Unknown('no-child-matched', n.id)
      n = next
    }
    return 'leaf'
  }

  /**
   * run + 반복 처리. 반복 본문 사슬이 끝(leaf)나면 한 회차가 끝난 것이다(2026-10-26 솔루션 확인):
   *   중단 조건이 참이면 같은 턴에 반복을 빠져나가 subflow의 then으로, 거짓이면 회차를 늘려
   *   count에 닿으면 빠져나가고(조건이 거짓인 채로), 아니면 같은 턴에 본문을 다시 돈다.
   */
  function drive(start, ctx, { isMain, frame }) {
    let r = run(start, ctx, { isMain, frame })
    while (r === 'leaf') {
      if (!frame) {
        if (isMain) state.resume = null
        return
      }
      if (loopExits(frame, ctx)) {
        const loopNode = frame.node
        frame = frame.parent
        const kids = loopNode.then || []
        if (!kids.length) continue // 바깥 사슬도 여기서 끝
        const next = firstMatch(kids, ctx)
        if (!next) throw new Unknown('no-child-matched', loopNode.id)
        r = run(next, ctx, { isMain, frame })
      } else {
        ctx.vars._loopCount = frame.count
        const b = firstMatch(frame.node.body || [], ctx)
        if (!b) continue
        r = run(b, ctx, { isMain, frame })
      }
    }
  }

  function loopExits(frame, ctx) {
    const cond = String(frame.node.config?.loop?.condition ?? '').trim()
    if (cond && evaluate(cond, scopeOf(ctx), frame.node.id)) return true
    frame.count++
    return frame.count >= frame.max
  }

  function exec(n, ctx, { isMain, frame = null, resumeAfterOutput = null }) {
    switch (n.type) {
      case 'greeting':
      case 'node':
      case 'group':
      case 'fallback':
        return 'continue'
      case 'output':
        return execOutput(n, ctx, { isMain, frame, resumeAfterOutput })
      case 'set':
        for (const it of (n.config?.items || [])) {
          assignPath(state, it.key, evaluate(String(it.value ?? 'undefined'), scopeOf(ctx), n.id), n.id)
        }
        return 'continue'
      case 'esd':
      case 'api':
        return execCall(n, ctx)
      case 'subflow':
        return execSubflow(n, ctx, { isMain, frame })
      default:
        throw new Unknown(`unsupported-node:${n.type}`, n.id)
    }
  }

  function execOutput(n, ctx, { isMain, frame, resumeAfterOutput }) {
    const scope = scopeOf(ctx)
    for (const it of (n.config?.items || [])) {
      const c = String(it?.condition ?? '').trim()
      if (c && !evaluate(c, scope, n.id)) continue
      if (it?.type !== 'text') throw new Unknown(`unsupported-item:${it?.type}`, n.id)
      ctx.events.push({ type: 'output', nodeId: n.id, texts: textCandidates(it, scope, n.id).map((t) => renderTemplate(t, scope, n.id)) })
    }
    if (n.config?.waitInput === true) throw new Unknown('wait-input-true', n.id)
    ctx.produced = true
    if (isMain) {
      const ids = resumeAfterOutput ?? (n.then || [])
      // 반복 본문 안의 output이면 다음 입력은 본문 사슬로 이어진다(검증 저장 등) — 반복 회차 상태를 들고 간다.
      state.resume = ids.length ? { ids, from: n.id, frame: resumeAfterOutput ? null : frame } : null
    }
    return 'stop'
  }

  function nextStub(name) {
    const s = stubs[name]
    if (s === undefined) throw new Unknown(`no-stub:${name}`)
    if (!Array.isArray(s)) return s
    const i = state.callIndex[name] = (state.callIndex[name] ?? -1) + 1
    return s[Math.min(i, s.length - 1)]
  }

  function execCall(n, ctx) {
    const scope = scopeOf(ctx)
    const c = n.config || {}
    let resource, op, args = {}
    if (n.type === 'esd') {
      resource = c.schemaName
      op = c.type
      for (const w of (c.query?.where || [])) args[w.field] = evaluate(String(w.value), scope, n.id)
      for (const [k, v] of Object.entries(c.query?.data || {})) args[k] = evaluate(String(v), scope, n.id)
    } else {
      resource = c.apiName
      op = 'call'
      for (const p of (c.params || [])) args[p.key] = evaluate(String(p.value), scope, n.id)
    }
    if (!resource) throw new Unknown('call-without-resource', n.id)
    ctx.events.push({ type: 'call', nodeId: n.id, kind: n.type, resource, op, args })

    const stub = nextStub(resource)
    if (stub.outcome === 'error') {
      ctx.vars._error = stub.message || `${resource} error`
      ctx.errored = true
      state.resume = null
      return 'stop'
    }
    ctx.vars._result = stub.outcome === 'empty'
      ? (stub.response !== undefined ? stub.response : (op === 'findall' ? [] : null))
      : stub.response
    const after = scopeOf(ctx)
    for (const r of (c.result || [])) {
      const rc = String(r?.condition ?? '').trim()
      if (rc && !evaluate(rc, after, n.id)) continue
      assignPath(state, r.key, evaluate(String(r.value), after, n.id), n.id)
    }
    return 'continue'
  }

  function execSubflow(n, ctx, { isMain, frame }) {
    const loop = n.config?.loop || {}
    const cond = String(loop.condition ?? '').trim()
    const countText = String(loop.count ?? '').trim()
    if (cond || countText) {
      const max = countText ? Number(countText) : Infinity
      if (!Number.isFinite(max) && countText) throw new Unknown('loop-count-not-number', n.id)
      if (!Number.isFinite(max) && !cond) throw new Unknown('loop-unbounded', n.id)
      // 중단 조건이 처음부터 참이면 본문을 건너뛴다(매뉴얼 예시).
      if (cond && evaluate(cond, scopeOf(ctx), n.id)) return 'continue'
      const loopFrame = { node: n, count: 0, max: Number.isFinite(max) ? max : Infinity, parent: frame }
      ctx.vars._loopCount = 0
      const b = firstMatch(n.body || [], ctx)
      if (!b) throw new Unknown('loop-empty-body', n.id)
      drive(b, ctx, { isMain, frame: loopFrame }) // 반복을 빠져나가면 drive가 then까지 이어서 돈다
      return 'stop'
    }
    // 반복 아님: body가 먼저. body에서 output이 나가면 다음 턴은 subflow의 then(body는 다시 돌지 않는다). [V2 Craft 관측]
    const b = firstMatch(n.body || [], ctx)
    if (b) {
      const r = run(b, ctx, { isMain, frame, resumeAfterOutput: n.then || [] })
      if (r === 'stop') return 'stop'
    }
    return 'continue'
  }
}

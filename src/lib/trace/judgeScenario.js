// 시나리오 판정 (순수) — 추적 결과를 기대 대화(evals/format.md)와 비교한다.
//
// 규칙(format.md "기대 종류"):
//   - 턴의 expect(금지 종류 제외)는 그 턴 사건열의 **부분열**과 맞으면 된다(사이에 다른 사건이 끼어도 된다).
//   - noCall·noOutputKeywords는 그 턴 **전체**에 대한 금지다.
//   - 연속된 output expect는 같은 output 사건 하나로 채울 수 있다 — 단 **같은 후보 문구 하나**가 둘 다 만족할 때만
//     (한 사건의 texts는 런타임이 그중 하나만 내는 후보들이다).
//   - 추적이 그 턴(또는 앞 턴)에서 unknown이면 시나리오는 unknown — 성공이 아니다.
//
// 이름 대응: 생성 봇의 자원·인텐트 이름은 원문과 다를 수 있어 채점기가 대응표를 만든다(format.md "인텐트 대응").
//   resourceMap: 기대 자원 이름 → 생성 봇 자원 이름. 없으면 같은 이름으로 본다.

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

function textOk(text, e) {
  const t = norm(text)
  if ((e.exact || []).some((x) => !t.includes(norm(x)))) return false
  return (e.keywordsAll || []).every((group) => group.some((k) => t.includes(norm(k))))
}

function argOk(actual, want, userTexts) {
  if (actual === undefined) return false
  const a = String(actual).trim()
  if (want && 'equals' in want) return a === String(want.equals).trim()
  if (want && 'fromTurnText' in want) return a === String(userTexts[want.fromTurnText] ?? '').trim()
  return true
}

/**
 * 한 턴 판정.
 * @returns {{ok: boolean, code?: string, at?: number}}
 */
export function judgeTurn(events, expects, { resourceMap = {}, userTexts = [] } = {}) {
  const res = (name) => resourceMap[name] ?? name
  // 금지 — 턴 전체
  for (let i = 0; i < expects.length; i++) {
    const e = expects[i]
    if (e.kind === 'noCall' && events.some((ev) => ev.type === 'call' && ev.resource === res(e.resource))) return { ok: false, code: 'forbidden-call', at: i }
    if (e.kind === 'noOutputKeywords') {
      const hit = events.some((ev) => ev.type === 'output' && ev.texts.some((t) => e.keywords.some((k) => norm(t).includes(norm(k)))))
      if (hit) return { ok: false, code: 'forbidden-output', at: i }
    }
  }
  // 부분열 맞추기
  let pos = 0
  let lastOutput = null // { index, candidates } — 연속 output expect가 같은 사건을 다시 쓸 때
  for (let i = 0; i < expects.length; i++) {
    const e = expects[i]
    if (e.kind === 'noCall' || e.kind === 'noOutputKeywords') continue
    if (e.kind === 'output' && lastOutput) {
      const still = lastOutput.candidates.filter((t) => textOk(t, e))
      if (still.length) { lastOutput.candidates = still; continue }
    }
    let found = -1
    for (let j = pos; j < events.length; j++) {
      const ev = events[j]
      if (e.kind === 'output' && ev.type === 'output') {
        const cands = ev.texts.filter((t) => textOk(t, e))
        if (cands.length) { found = j; lastOutput = { index: j, candidates: cands }; break }
      } else if (e.kind === 'call' && ev.type === 'call' && ev.resource === res(e.resource)) {
        const okArgs = Object.entries(e.args || {}).every(([k, want]) => argOk(ev.args?.[k], want, userTexts))
        if (okArgs) { found = j; break }
      } else if ((e.kind === 'awaitInput' || e.kind === 'end') && ev.type === e.kind) {
        found = j
        break
      }
    }
    if (found < 0) return { ok: false, code: `missing-${e.kind}`, at: i }
    if (e.kind !== 'output') lastOutput = null
    pos = found + 1
  }
  return { ok: true }
}

/**
 * @param {{turns: Array<{events: object[]}>}} trace - traceDialogue 결과
 * @param {{turns: Array<{user: object, expect: object[]}>}} scenario
 * @returns {{status: 'pass'|'fail'|'unknown', turn?: number, code?: string, at?: number}}
 */
export function judgeScenario(trace, scenario, opts = {}) {
  const userTexts = scenario.turns.map((t) => t.user?.text ?? '')
  for (let i = 0; i < scenario.turns.length; i++) {
    const events = trace.turns[i]?.events || []
    const unk = events.find((ev) => ev.type === 'unknown')
    if (unk) return { status: 'unknown', turn: i, code: unk.reason }
    const r = judgeTurn(events, scenario.turns[i].expect || [], { ...opts, userTexts })
    if (!r.ok) return { status: 'fail', turn: i, code: r.code, at: r.at }
  }
  return { status: 'pass' }
}

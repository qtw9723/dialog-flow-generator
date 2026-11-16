// 데모 전용 모의 백엔드 — VITE_DEMO=true 빌드에서만 활성화된다(실서비스 번들 동작 무변경).
// 실제 앱 화면을 그대로 구동하되 서버 대신 이 파일이 /functions/v1/* 호출에 답한다.
// 생성 결과는 실제 파이프라인의 결정론 구간(검증·보정·확장)을 실행해 기록한 demo/recorded/bot.json이다.
// LLM 호출 자리(자연어 분석·플로우 설계)만 스크립트된 응답으로 대신한다 — 실운영이 아니다.
import recorded from '../../demo/recorded/bot.json'

const DEMO = import.meta.env.VITE_DEMO === 'true'
const DEMO_USER = { id: 'demo-user', email: 'demo@example.com' }
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString()

export const demoSupabase = {
  auth: {
    getSession: async () => ({ data: { session: { access_token: 'demo-token', user: DEMO_USER } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({}),
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({ data: { user: DEMO_USER }, error: null }),
  },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'approved' } }) }) }) }),
}

const TEMPLATE = {
  id: 'tpl-scenario', name: '시나리오 템플릿',
  fields: [
    { name: '시나리오 이름', type: 'text', required: true },
    { name: '진입 발화', type: 'text', required: true },
    { name: '수집 정보', type: 'group_list', required: false, fields: [{ name: '항목명', type: 'text' }] },
    { name: '외부 연동', type: 'group_list', required: false, fields: [{ name: '연동명', type: 'text' }, { name: '설명', type: 'text' }] },
    { name: '완료 시 결과', type: 'textarea', required: false },
  ],
}
const QUESTIONS = [
  { id: 'q-name', text: '챗봇 이름', question_role: 'required_context', input_type: 'text', order_index: 1, required: true },
  { id: 'q-scn', text: '챗봇이 처리할 시나리오', question_role: 'required_context', input_type: 'templated', template_id: TEMPLATE.id, order_index: 2, required: true },
]

function makeResult(id, name, minAgo) {
  const bot = JSON.parse(JSON.stringify(recorded.bot))
  bot.name = name
  return {
    id, created_at: iso(minAgo), updated_at: iso(minAgo), reference_id: 'ref-master',
    responses: { 'q-name': name, 'q-scn': [{ '시나리오 이름': '반품 접수', '진입 발화': '반품하고 싶어요', '수집 정보': [{ 항목명: '운송장 번호' }, { 항목명: '반품 사유' }] }] },
    generated_json: bot,
    generation_tiers: {
      flow: recorded.flow,
      design_stats: { node_count: recorded.flow.nodes.length, llm_calls: 2, repaired: 1, reprompted: 1 },
      usage: { calls: 4, prompt_tokens: 5120, completion_tokens: 1840, total_tokens: 6960, estimated_cost_usd: 0.0123, model: 'demo-scripted', duration_ms: 9400 },
      created_by: DEMO_USER.email, source: 'nl', scenarios: { n1: '반품 접수' },
      validation: { valid: true, errors: [] },
    },
  }
}

const state = { results: DEMO ? [makeResult('demo-0001-return', '택배 반품 접수 챗봇', 42)] : [] }
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function handle(fn, url, method, body) {
  const id = url.searchParams.get('id')
  switch (fn) {
    case 'admin-questions': case 'questions': return json(QUESTIONS)
    case 'admin-templates': return json(id ? TEMPLATE : [TEMPLATE])
    case 'admin-references': return json([{ id: 'ref-master', name: '마스터 참고자료', is_master: true, content: {}, created_at: iso(9999) }])
    case 'results': case 'admin-results': {
      if (method === 'DELETE') { state.results = state.results.filter((r) => r.id !== id); return json({ ok: true }) }
      if (id) { const r = state.results.find((x) => x.id === id); return r ? json(r) : json({ error: '결과 없음' }, 404) }
      return json(state.results)
    }
    case 'nl-scenario-parse':
      await sleep(1400)
      return json({ botName: '택배 반품 접수 챗봇', scenarios: [{ name: '반품 접수', trigger: '반품하고 싶어요', done: '반품 접수가 완료되었습니다.', collect: ['운송장 번호', '반품 사유'], integrations: [] }] })
    case 'dialogflow-generator': {
      await sleep(2600)
      const name = (body && Object.values(body.responses || {}).find((v) => typeof v === 'string')) || '택배 반품 접수 챗봇'
      const r = makeResult('demo-' + Date.now().toString(36), name, 0)
      state.results.unshift(r)
      return json(r)
    }
    default: return json(id ? {} : [])
  }
}

if (DEMO && typeof window !== 'undefined' && !window.__demoInstalled) {
  window.__demoInstalled = true
  const realFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href)
    const m = u.pathname.match(/\/functions\/v1\/([^/]+)/)
    if (!m) return realFetch(input, init)
    let body = null; try { body = init && init.body ? JSON.parse(init.body) : null } catch { /* noop */ }
    return handle(m[1].replace(/-dev$/, ''), u, ((init && init.method) || 'GET').toUpperCase(), body)
  }
  const band = document.createElement('div')
  band.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#2B3FF0;color:#fff;padding:7px 14px;font:13px/1.4 system-ui,sans-serif;display:flex;gap:14px;flex-wrap:wrap;align-items:center')
  band.innerHTML = '<b>실운영 아님 · 데모</b><span>실제 앱 화면입니다. LLM 호출 자리만 스크립트 응답이며, 데이터는 이 브라우저 안에만 있습니다.</span><span style="margin-left:auto;display:flex;gap:14px"><a href="/replay.html" style="color:#fff">실행 기록 재생</a><a href="https://github.com/qtw9723/dialog-flow-generator" style="color:#fff">소스</a></span>'
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(band); document.body.style.paddingBottom = '40px' })
}

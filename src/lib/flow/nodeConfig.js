// 노드 내용(기능) 편집용 순수 헬퍼 (UI 무의존).
// 머신 노드 config ↔ 편집기 필드 매핑. 타입별 런타임 config shape은 생성기 계약을 따른다:
//   output  : config.items[<text>].text[0].texts[0]                    (멘트)
//   set     : config.items[0] = { key:'<scope>.<name>', value, condition:'' }
//   input   : set과 동일하되 value='input.text' (엔진은 set으로 캡처)
//   esd     : config { type, query:{where:[]|null, data?}, result:[{key,value:'_result'}], schemaName }
//   api     : config { apiName, params:[{key,value}], result:[{key,value:'_result'}] }
//   llmchat : config { tool:'', type:'openai', model:'', apiKey:'', prompt, stream, history }
//   subflow: config.loop = { condition, count }
// node/condition(분기)은 라벨만 — 조건은 나가는 엣지(EdgeConditionEditor)가 담당한다.

import { isEditableType } from './nodeTypeRegistry.js'

// 변수 스코프 — local: 한 플로우에만 사는 지역변수 · context: 전역변수 · secure: 개인정보용 암호화 전역변수.
export const SCOPES = ['local', 'context', 'secure']
export const ESD_OPS = ['findone', 'findall', 'create', 'update', 'remove']
export const ESD_EXPRESSIONS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like']

// 편집기가 내용 필드를 제공하는 타입(그 외는 라벨만).
export const CONTENT_TYPES = new Set(['output', 'set', 'input', 'esd', 'api', 'llmchat', 'subflow'])

function scopeSplit(key) {
  const k = String(key || '')
  const m = k.match(/^(context|local|secure)\.(.*)$/)
  return m ? { scope: m[1], name: m[2] } : { scope: 'local', name: k }
}
const joinKey = (scope, name) => (name ? `${scope || 'local'}.${name}` : '')

// ── output ──────────────────────────────────────────────────────────────
function readOutput(config) {
  const ti = (config?.items || []).find((it) => it?.type === 'text')
  return { ment: String(ti?.text?.[0]?.texts?.[0] ?? '') }
}
function writeOutput(config, { ment }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  const items = Array.isArray(base.items) ? base.items.map((it) => ({ ...it })) : []
  let idx = items.findIndex((it) => it?.type === 'text')
  const msg = String(ment ?? '')
  if (idx === -1) {
    items.unshift({ type: 'text', condition: '', channels: [{ name: 'Web', use: true }], text: [{ condition: '', texts: [msg] }] })
  } else {
    const it = items[idx]
    const text = Array.isArray(it.text) && it.text.length ? it.text.map((t) => ({ ...t })) : [{ condition: '', texts: [] }]
    text[0] = { ...text[0], texts: [msg] }
    items[idx] = { ...it, text }
  }
  base.items = items
  if (base.waitInput === undefined) base.waitInput = false
  return base
}

// ── set / input ─────────────────────────────────────────────────────────
function readSet(config) {
  const it = config?.items?.[0] || {}
  const { scope, name } = scopeSplit(it.key)
  return { scope, name, value: String(it.value ?? '') }
}
function writeSet(config, { scope, name, value }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  base.items = [{ key: joinKey(scope, name), value: String(value ?? ''), condition: '' }]
  return base
}
function readInput(config) {
  const it = config?.items?.[0] || {}
  const { scope, name } = scopeSplit(it.key)
  return { scope, name }
}
function writeInput(config, { scope, name }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  base.items = [{ key: joinKey(scope, name), value: 'input.text', condition: '' }]
  return base
}

// ── esd ─────────────────────────────────────────────────────────────────
function readEsd(config) {
  const q = config?.query || {}
  const where = Array.isArray(q.where)
    ? q.where.map((w) => ({ field: String(w?.field || ''), expression: String(w?.expression || 'eq'), value: String(w?.value ?? '') }))
    : []
  const dataObj = q.data && typeof q.data === 'object' ? q.data : {}
  const data = Object.entries(dataObj).map(([field, value]) => ({ field: String(field), value: String(value ?? '') }))
  return {
    opType: String(config?.type || 'findone'),
    schemaName: String(config?.schemaName || q.schemaName || ''),
    where, data,
    resultKey: String(config?.result?.[0]?.key || ''),
  }
}
function writeEsd(config, { opType, schemaName, where, data, resultKey }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  base.type = opType || 'findone'
  base.schemaName = schemaName || ''
  if (base.type === 'create') {
    const dataObj = {}
    for (const r of (data || [])) if (r?.field) dataObj[r.field] = String(r.value ?? '')
    base.query = { where: null, data: dataObj }
  } else {
    base.query = {
      where: (where || [])
        .filter((w) => w?.field)
        .map((w) => ({ field: w.field, value: String(w.value ?? ''), expression: w.expression || 'eq' })),
    }
  }
  base.result = resultKey ? [{ key: resultKey, value: '_result', condition: '' }] : []
  return base
}

// ── api ─────────────────────────────────────────────────────────────────
function readApi(config) {
  const params = Array.isArray(config?.params)
    ? config.params.map((p) => ({ key: String(p?.key || ''), value: String(p?.value ?? '') }))
    : []
  return { apiName: String(config?.apiName || ''), params, resultKey: String(config?.result?.[0]?.key || '') }
}
function writeApi(config, { apiName, params, resultKey }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  base.apiName = apiName || ''
  base.params = (params || []).filter((p) => p?.key).map((p) => ({ key: p.key, value: String(p.value ?? '') }))
  base.result = resultKey ? [{ key: resultKey, value: '_result', condition: '' }] : []
  return base
}

// ── llmchat ─────────────────────────────────────────────────────────────
function readLlm(config) {
  return { prompt: String(config?.prompt || ''), history: String(config?.history ?? '2'), stream: config?.stream !== false }
}
function writeLlm(config, { prompt, history, stream }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  base.tool = base.tool ?? ''
  base.type = base.type || 'openai'
  base.model = base.model ?? ''
  base.apiKey = base.apiKey ?? ''
  base.prompt = String(prompt ?? '')
  base.stream = stream !== false
  base.history = String(history ?? '2')
  return base
}

// ── subflow(loop) ─────────────────────────────────────────────────────
function readLoop(config) {
  const loop = config?.loop || {}
  return { condition: String(loop.condition || ''), count: String(loop.count ?? '') }
}
function writeLoop(config, { condition, count }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  base.loop = { ...(base.loop || {}), condition: String(condition || ''), count: String(count ?? '') }
  return base
}

/**
 * 머신 노드 → 편집기 필드({ type, label, ...타입별 }).
 * @param {{type?:string,label?:string,config?:object}} node
 */

// ── stack (화면 이동) ────────────────────────────────────────────────────
// 실측 config: { type: 'clear'|'back'|'save'|'restore', prompt, result[{key,value,condition}] }
// ⚠ config.type은 **노드 타입이 아니라 화면 동작**이다(노드 타입은 항상 'stack').
export const STACK_ACTIONS = ['clear', 'back', 'save', 'restore']
export const STACK_ACTION_KO = {
  clear: '처음으로 (쌓인 화면 비우기)',
  back: '뒤로 (직전 화면)',
  save: '현재 화면 저장',
  restore: '저장한 화면 복원',
}

function readStack(config) {
  return {
    action: String(config?.type ?? 'clear'),
    items: (Array.isArray(config?.result) ? config.result : []).map((it) => ({
      key: String(it?.key ?? ''),
      value: String(it?.value ?? ''),
    })),
  }
}

function writeStack(config, { action, items }) {
  const base = config && typeof config === 'object' ? { ...config } : {}
  base.type = STACK_ACTIONS.includes(action) ? action : 'clear'
  const prev = Array.isArray(base.result) ? base.result : []
  base.result = (items || [])
    .filter((it) => String(it?.key ?? '').trim())
    .map((it, i) => ({ ...(prev[i] && typeof prev[i] === 'object' ? prev[i] : {}), key: it.key, value: String(it.value ?? '') }))
  return base
}

export function readNodeFields(node) {
  const type = node?.type
  const config = node?.config || {}
  const base = { type, label: String(node?.label || '') }
  switch (type) {
    case 'output': return { ...base, ...readOutput(config) }
    case 'set': return { ...base, ...readSet(config) }
    case 'input': return { ...base, ...readInput(config) }
    case 'esd': return { ...base, ...readEsd(config) }
    case 'api': return { ...base, ...readApi(config) }
    case 'llmchat': return { ...base, ...readLlm(config) }
    case 'subflow': return { ...base, ...readLoop(config) }
    case 'stack': return { ...base, ...readStack(config) }
    // node/condition은 편집 가능(분기 조건은 엣지에서 설정)하므로 라벨만.
    // 레지스트리상 편집 불가한 타입(업로드한 솔루션 봇에서 편집기가 없는 타입)만 원본 config를
    // rawConfig로 실어 보낸다 — 편집기가 읽기 전용으로 보여주기만 하고 쓰지는 않는다.
    default:
      return isEditableType(type) ? base : { ...base, rawConfig: node?.config }
  }
}

/**
 * 편집기 필드 → 새 config 객체(입력 config 불변, 새 객체 반환).
 * 내용 필드가 없는 타입(node/condition 등)은 config를 그대로 돌려준다.
 * @param {string} type
 * @param {object} config - 기존 config(보존 필드 유지용)
 * @param {object} fields - 편집기 필드(label 제외)
 */
export function writeNodeConfig(type, config, fields) {
  switch (type) {
    case 'output': return writeOutput(config, fields)
    case 'set': return writeSet(config, fields)
    case 'input': return writeInput(config, fields)
    case 'esd': return writeEsd(config, fields)
    case 'api': return writeApi(config, fields)
    case 'llmchat': return writeLlm(config, fields)
    case 'subflow': return writeLoop(config, fields)
    case 'stack': return writeStack(config, fields)
    default: return config
  }
}

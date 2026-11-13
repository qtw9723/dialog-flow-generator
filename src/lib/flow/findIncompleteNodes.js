// 내용 미완성 노드 검출 (순수) — 다이어그램 편집 재검증 보강.
// 노드를 추가만 하고 내용(멘트·변수·API·기록 대상·프롬프트·반복 조건)을 채우지 않으면
// 아무 일도 하지 않는 불완전한 노드가 된다 — 이를 잡아 확정을 차단한다.
//
// **원본 flow에 없던(새로 추가된) 노드만** 대상으로 한다. 기존 생성 노드는 우리가
// 인식 못 하는 유효 config를 오탐할 수 있어 검사하지 않는다(과잉 차단 방지).
// 분기(node/condition)는 조건이 나가는 엣지에 있으므로 여기서 검사하지 않는다(위상 검증이 담당).

const BOILER_TYPES = new Set(['greeting', 'fallback'])
const KIND_KO = {
  output: '안내', input: '입력', set: '저장', node: '분기', condition: '분기',
  subflow: '반복', llmchat: 'AI 응답', api: 'API 연동', esd: '기록 저장',
}

function collectIds(flow) {
  const ids = new Set()
  for (const d of (flow?.dialogs || [])) for (const n of (d?.nodes || [])) ids.add(n.id)
  return ids
}

// 타입별 미완성 사유(없으면 null = 완성).
function incompleteReason(node) {
  const c = node?.config || {}
  switch (node?.type) {
    case 'output': {
      const ti = (c.items || []).find((it) => it?.type === 'text')
      const ment = ti?.text?.[0]?.texts?.[0]
      return String(ment || '').trim() ? null : '멘트가 비어 있습니다'
    }
    case 'set':
      return String(c.items?.[0]?.key || '').trim() ? null : '저장할 변수가 지정되지 않았습니다'
    case 'input':
      return String(c.items?.[0]?.key || '').trim() ? null : '담을 변수가 지정되지 않았습니다'
    case 'esd':
      return String(c.schemaName || c.query?.schemaName || '').trim() ? null : '기록 대상(스키마)이 지정되지 않았습니다'
    case 'api':
      return String(c.apiName || '').trim() ? null : 'API가 지정되지 않았습니다'
    case 'llmchat':
      return String(c.prompt || '').trim() ? null : '프롬프트가 비어 있습니다'
    case 'subflow':
      return String(c.loop?.condition || '').trim() ? null : '반복 종료조건이 지정되지 않았습니다'
    default:
      return null // node/condition 등: 검사 없음
  }
}

/**
 * @param {object} flow - 현재(편집 중) 머신 다이얼로그 트리
 * @param {object} originalFlow - 편집 이전 원본(추가 노드 판별 기준)
 * @returns {Array<{nodeId:string, type:string, label:string, message:string}>}
 */
export function findIncompleteNodes(flow, originalFlow) {
  const origIds = collectIds(originalFlow)
  const out = []
  for (const d of (flow?.dialogs || [])) {
    for (const n of (d?.nodes || [])) {
      if (origIds.has(n.id) || BOILER_TYPES.has(n.type)) continue
      const reason = incompleteReason(n)
      if (reason) {
        out.push({
          nodeId: n.id,
          type: n.type || '',
          label: String(n.label || '').trim(),
          message: `${KIND_KO[n.type] || n.type || '노드'} 노드: ${reason}`,
        })
      }
    }
  }
  return out
}

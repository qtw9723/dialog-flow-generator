import { useState, useCallback, useEffect } from 'react'
import { useResults } from '../../context/ResultsContext'
import { toFlowSpecView, applyRepairedView } from '../../lib/edit/flowSpecView'
import { validateFlow, repairFlow } from '../../lib/edit/validateFlowClient'
import { validateConditions } from '../../lib/flow/validateConditions'
import { findIsolatedNodes } from '../../lib/flow/findIsolatedNodes'
import { findIncompleteNodes } from '../../lib/flow/findIncompleteNodes'
import { findAmbiguousBranches } from '../../lib/flow/findAmbiguousBranches'
import { findConditionlessRoots } from '../../lib/flow/findConditionlessRoots'
import { findShadowedBranches, describeShadowed } from '../../lib/flow/findShadowedBranches'
import { normalizeElseOrder } from '../../lib/flow/normalizeElseOrder'
import { undoTarget } from '../../lib/edit/undoTarget'
import FlowCanvas from '../flow/FlowCanvas'
import EdgeConditionEditor from '../flow/EdgeConditionEditor'
import NodeEditor from '../flow/NodeEditor'
import { Button } from '../common/Button'

export default function DiagramEditPanel({ result, name, onResultUpdate, onExitEdit }) {
  const { applyResultEdit, undoResultEdit } = useResults()
  const [pendingFlow, setPendingFlow] = useState(null)
  const [validation, setValidation] = useState(null)
  const [repairedFlow, setRepairedFlow] = useState(null)
  const [applying, setApplying] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState('')
  const [edgeCtx, setEdgeCtx] = useState(null)  // 선택된 엣지 조건 편집 컨텍스트(FlowCanvas 통지)
  const [nodeCtx, setNodeCtx] = useState(null)  // 선택된 노드 내용 편집 컨텍스트(FlowCanvas 통지)
  // 캔버스 리마운트 키 — 편집 모드의 FlowCanvas는 캔버스가 소스 오브 트루스라 flowJson prop 변경을
  // 무시한다(미확정 편집 보호). 되돌리기처럼 flow를 되감을 땐 이 키를 올려 새 flow로 다시 시드한다.
  const [canvasKey, setCanvasKey] = useState(0)

  // 검증 계산만 하는 순수 경로 — 상태 세팅은 호출자가 한다(마운트 검사는 pendingFlow를 안 건드림).
  const computeValidation = useCallback((flow) => {
    const { view, catalog } = toFlowSpecView(flow)
    const { flow: repView, repaired } = repairFlow(view, catalog)
    const repairedApplied = repaired ? applyRepairedView(flow, repView) : flow
    // else(조건 없는 갈래)는 형제 조건 갈래보다 뒤여야 한다 — 앞에 있으면 순서대로 평가하는
    // 런타임에서 조건 갈래가 죽는다. then 순서를 바꿀 UI가 없으므로 자동 정렬하고 알린다.
    const { flow: applied, moved: reordered } = normalizeElseOrder(repairedApplied)
    const v = validateFlow(repView, catalog)
    // 위상 검증(v)에 더해 조건식 검증 — 문법 오류는 차단(error), 미정의 변수는 경고(비차단).
    const condIssues = validateConditions(applied)
    const fmt = (i) => `${i.nodeId}: ${i.message}`
    const condErrors = condIssues.filter((i) => i.severity === 'error').map(fmt)
    const condWarnings = condIssues.filter((i) => i.severity === 'warning').map(fmt)
    // 고립 노드(들어오는·나가는 연결 모두 없음) — 아무 데도 연결 안 된 불완전 상태라 차단.
    // 시나리오 시작 노드(진입 조건 있는 루트)는 제외한다(들어오는 연결 없는 게 정상).
    const isoErrors = findIsolatedNodes(applied).map((n) => `${n.label || n.nodeId}: 아무 곳에도 연결되지 않은 노드`)
    // 새로 추가된 노드가 내용(멘트·변수·API·기록 대상·프롬프트·반복 조건)을 못 갖추면 차단.
    const incErrors = findIncompleteNodes(applied, result.generated_json).map((n) => (n.label ? `${n.label} — ${n.message}` : n.message))
    // 조건 없는(모호한) 분기 — 한 노드에서 갈라지는데 조건 없는 갈래가 2개+면 판단 불가 → 차단.
    const ambErrors = findAmbiguousBranches(applied).map((b) => `${b.label}: 분기에 조건 없는 갈래가 ${b.count}개 — 각 연결선에 조건을 넣어야 합니다`)
    // 조건 없는 시나리오 루트 — 그 뒤 시나리오가 진입 불가(런타임이 then 순서대로 확인).
    const rootNotes = findConditionlessRoots(applied).map((r) => `${r.label}: 시나리오 진입 조건이 없습니다 — 이 뒤의 시나리오는 진입하지 못합니다`)
    // 가려진 갈래(true·중복 조건). 조건 없는 갈래 2개+는 위 ambErrors가 이미 차단하므로 중복 안내하지 않는다.
    const shadowNotes = findShadowedBranches(applied).filter((b) => b.reason !== 'empty').map(describeShadowed)
    const orderNotes = reordered.map((b) => `${b.label}: 조건 없는 '그 외' 갈래를 마지막으로 옮겼습니다 (앞에 있으면 조건 갈래가 실행되지 않습니다)`)
    const allErrors = [...(v.errors || []), ...condErrors, ...isoErrors, ...incErrors, ...ambErrors]
    return {
      applied,
      reordered,
      validation: {
        valid: v.valid !== false && condErrors.length === 0 && isoErrors.length === 0 && incErrors.length === 0 && ambErrors.length === 0,
        errors: allErrors,
        warnings: [...condWarnings, ...orderNotes, ...rootNotes, ...shadowNotes],
      },
    }
  }, [result.generated_json])

  const handleFlowChange = useCallback((newFlow) => {
    setPendingFlow(newFlow)
    try {
      const { applied, validation } = computeValidation(newFlow)
      setValidation(validation)
      setRepairedFlow(applied)
    } catch (e) {
      setValidation({ valid: false, errors: [e.message], warnings: [] })
      setRepairedFlow(null)
    }
  }, [computeValidation])

  // 편집 진입 시 검사 — 이미 확정된 else-first 플로우를 편집 전에도 알린다.
  // pendingFlow는 세팅하지 않는다(손대지 않았는데 확정/되돌리기가 열리면 안 됨). 다만
  // 정렬이 실제로 필요했다면 그건 저장돼야 할 교정이므로 pending으로 승격한다.
  //
  // result.generated_json이 바뀔 때(마운트·확정 이력 되돌리기)는 이 useEffect가 재실행되며
  // 잡는다. 하지만 "미확정 편집 되돌리기"(target === 'pending')는 result.generated_json을
  // 건드리지 않고 resetEditState로 상태만 비우므로 이 effect가 재실행되지 않는다 —
  // 그래서 resetEditState가 직접 runEntryCheck를 호출해 같은 검사를 다시 돈다.
  //
  // 순환 방지: runEntryCheck는 이 effect 밖에서 명령형으로 호출되는 일반 함수이고, effect의
  // 의존성은 [runEntryCheck](= computeValidation, result.generated_json에서만 파생)이지
  // pendingFlow/validation/repairedFlow가 아니다. 따라서 runEntryCheck가 setPendingFlow 등을
  // 호출해도 이 effect를 다시 트리거하지 않는다 — "검사 → pending 세팅 → 검사 재실행"의
  // 순환이 구조적으로 불가능하다.
  const runEntryCheck = useCallback(() => {
    try {
      const { applied, validation, reordered } = computeValidation(result.generated_json)
      setValidation(validation)
      if (reordered.length) { setPendingFlow(applied); setRepairedFlow(applied) }
    } catch (e) {
      // 진입 검사 실패는 편집 자체를 막지 않는다 — 다만 조용히 묻히지 않게 로그는 남긴다.
      console.warn('[DiagramEditPanel] 편집 진입 검사 실패:', e)
    }
  }, [computeValidation, result.generated_json])

  useEffect(() => {
    runEntryCheck()
  }, [runEntryCheck])

  // D4: valid:false이면 확정 버튼 비활성 — 파괴적 저장 금지.
  // 저장할 flow가 실제로 있어야 활성화(repairedFlow || pendingFlow) — 정렬이 불필요해
  // 마운트 검사가 아무것도 승격하지 않은 경우, validation만 non-null이고 저장할 게 없는
  // 상태에서 버튼이 거짓 활성화되는 회귀를 막는다.
  const canConfirm = validation !== null && validation.valid !== false && !applying && (repairedFlow || pendingFlow) != null

  const handleApply = async () => {
    const flowToSave = repairedFlow || pendingFlow
    if (!flowToSave) return
    setApplying(true)
    setError('')
    try {
      const entry = {
        ts: Date.now(),
        mode: 'diagram',
        instruction: '다이어그램 편집',
        snapshotBefore: result.generated_json,
      }
      const updated = await applyResultEdit(result.id, flowToSave, entry)
      onResultUpdate(updated)
      setPendingFlow(null)
      setValidation(null)
      setRepairedFlow(null)
      setNodeCtx(null)
      setEdgeCtx(null)
      onExitEdit()
    } catch (e) {
      setError(e.message || '확정 중 오류가 발생했습니다')
    } finally {
      setApplying(false)
    }
  }

  // 편집 세션 상태를 비우고(캔버스는 canvasKey로 다시 시드) 진입 검사를 다시 돈다.
  // 재검사가 필요한 이유: '미확정 편집 되돌리기'(target === 'pending')는 result.generated_json이
  // 그대로라 마운트 검사 useEffect가 재실행되지 않는다 — 여기서 명시적으로 runEntryCheck를
  // 불러 else 정렬 경고 등을 되돌린 flow 기준으로 되살린다. 확정 이력 되돌리기 경로에서도
  // 호출되지만 그쪽은 result.generated_json이 바뀌어 effect가 어차피 재실행되므로 중복 실행일
  // 뿐 무해하다(멱등).
  const resetEditState = () => {
    setPendingFlow(null)
    setValidation(null)
    setRepairedFlow(null)
    setEdgeCtx(null)
    setNodeCtx(null)
    setCanvasKey((k) => k + 1)
    runEntryCheck()
  }

  const hasHistory =
    Array.isArray(result?.bundle?.edit_history) &&
    result.bundle.edit_history.length > 0

  const target = undoTarget({ hasPendingEdit: pendingFlow !== null, hasHistory })

  const handleUndo = async () => {
    // 미확정 편집이 있으면 그것부터 되돌린다 — 확정 이력에 손대지 않는다(undoTarget 참고).
    if (target === 'pending') { resetEditState(); return }
    if (target !== 'history') return
    setUndoing(true)
    setError('')
    try {
      const updated = await undoResultEdit(result.id)
      onResultUpdate(updated)
      resetEditState()  // 되감은 flow로 캔버스 재시드
    } catch (e) {
      setError(e.message || '되돌리기 중 오류가 발생했습니다')
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded overflow-hidden" style={{ height: '32rem' }}>
        <FlowCanvas
          key={canvasKey}
          flowJson={result.generated_json}
          name={name}
          readOnly={false}
          onFlowChange={handleFlowChange}
          onEdgeSelect={setEdgeCtx}
          onNodeSelect={setNodeCtx}
          scenarioNames={result?.bundle?.scenarios}
        />
      </div>

      {nodeCtx && (
        <NodeEditor
          key={nodeCtx.id}
          node={nodeCtx.node}
          flowJson={nodeCtx.flowJson}
          result={result}
          onApply={(fields) => { nodeCtx.apply(fields); setNodeCtx(null) }}
          onClose={() => setNodeCtx(null)}
        />
      )}

      {edgeCtx && (
        <EdgeConditionEditor
          key={edgeCtx.id}
          condition={edgeCtx.condition}
          sourceLabel={edgeCtx.sourceLabel}
          targetLabel={edgeCtx.targetLabel}
          flowJson={edgeCtx.flowJson}
          onApply={(expr) => edgeCtx.apply(expr)}
          onClose={() => setEdgeCtx(null)}
        />
      )}

      {validation && (
        <div className="space-y-2">
          <div className={`text-sm rounded p-3 ${validation.valid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            {validation.valid
              ? '재검증 통과 — 확정 가능합니다.'
              : `재검증 실패 (확정 불가): ${(validation.errors || []).join(', ')}`
            }
          </div>
          {(validation.warnings || []).length > 0 && (
            <div className="text-sm rounded p-3 bg-amber-50 text-amber-700 border border-amber-200">
              조건 경고(확정은 가능): {validation.warnings.join(', ')}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 flex-wrap items-center">
        <Button
          onClick={handleApply}
          disabled={!canConfirm}
        >
          {applying ? '저장 중...' : '확정'}
        </Button>
        {target !== 'none' && (
          <Button
            onClick={handleUndo}
            disabled={undoing || applying}
            variant="outlinePrimary"
            title={target === 'pending'
              ? '아직 확정하지 않은 편집을 모두 취소하고 마지막 확정 상태로 되돌립니다'
              : '마지막으로 확정한 편집을 취소하고 그 직전 상태로 되돌립니다'}
          >
            {undoing ? '되돌리는 중...' : (target === 'pending' ? '편집 되돌리기' : '직전 확정 되돌리기')}
          </Button>
        )}
        <Button onClick={onExitEdit} disabled={applying} variant="outlinePrimary">
          편집 취소
        </Button>
        {!pendingFlow && (
          <span className="text-xs text-gray-400">노드 추가·삭제·연결 후 재검증이 자동으로 실행됩니다.</span>
        )}
      </div>
    </div>
  )
}

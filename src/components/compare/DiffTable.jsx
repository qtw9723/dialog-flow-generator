import { useState } from 'react'
import { Card } from '../common/Card'
import { Button } from '../common/Button'
import { groupIntentDiff } from '../../lib/compare/groupDiff.js'
import { readableKey } from '../../lib/compare/diffRows.js'
import { ROW_JOIN } from '../../lib/compare/diffToCsv.js'

// 차이 목록 표시. 판단이 들어가는 로직은 전부 src/lib/compare/의 순수 모듈에 있고
// 여기서는 그리기만 한다 (이 저장소에는 컴포넌트 테스트 하네스가 없다).
//
// 시각 어휘는 src/components/results/nodeDiff.jsx와 같다 —
// 추가 = + 초록, 삭제 = - 빨강 취소선, 변경 = 이전 → 이후.

// 한 번에 그릴 최대 건수. 비교 자체는 무제한이고 터지는 건 DOM이다.
const PAGE = 200

const Added = ({ children }) => <span className="text-green-700">+ {children}</span>
const Removed = ({ children }) => <span className="text-red-600 line-through">- {children}</span>

function Changed({ before, after }) {
  return (
    <span>
      <span className="text-red-500 line-through">{before || '(빈칸)'}</span>
      <span className="mx-1 text-[#9CA3AF]">→</span>
      <span className="text-green-700">{after || '(빈칸)'}</span>
    </span>
  )
}

function KeyLabel({ children }) {
  return <p className="mb-1 font-mono text-[11px] text-[#9CA3AF]">{children}</p>
}

function IntentGroups({ diff }) {
  const groups = groupIntentDiff(diff)
  const [shown, setShown] = useState(PAGE)
  const visible = groups.slice(0, shown)

  return (
    <div className="space-y-2">
      {visible.map((g) => (
        <Card key={g.intent} className="p-3 text-xs">
          <p className="mb-1 font-medium text-[#1F2937]">{g.intent}</p>
          <div className="space-y-0.5">
            {g.added.map((ex, i) => <p key={`a${i}`}><Added>{ex}</Added></p>)}
            {g.removed.map((ex, i) => <p key={`r${i}`}><Removed>{ex}</Removed></p>)}
          </div>
        </Card>
      ))}
      <More total={groups.length} shown={shown} onMore={() => setShown(shown + PAGE)} unit="인텐트" />
    </div>
  )
}

function FlatList({ diff }) {
  const entries = [
    ...diff.added.map((e) => ({ type: 'added', ...e })),
    ...diff.removed.map((e) => ({ type: 'removed', ...e })),
    ...diff.changed.map((e) => ({ type: 'changed', ...e })),
  ]
  const [shown, setShown] = useState(PAGE)
  const visible = entries.slice(0, shown)

  return (
    <div className="space-y-2">
      {visible.map((e, i) => (
        <Card key={`${e.type}-${e.key}-${i}`} className="p-3 text-xs">
          <KeyLabel>{readableKey(e.key)}</KeyLabel>
          {e.type === 'added' && <p><Added>{e.row.join(ROW_JOIN)}</Added></p>}
          {e.type === 'removed' && <p><Removed>{e.row.join(ROW_JOIN)}</Removed></p>}
          {e.type === 'changed' && (
            <div className="space-y-0.5">
              {e.cells.map((c) => (
                <p key={c.header}>
                  <span className="mr-2 text-[#6B7280]">{c.header}</span>
                  <Changed before={c.before} after={c.after} />
                </p>
              ))}
              {e.sets.map((s) => (
                <p key={s.header}>
                  <span className="mr-2 text-[#6B7280]">{s.header}</span>
                  {s.added.map((v, k) => <span key={`a${k}`} className="mr-2"><Added>{v}</Added></span>)}
                  {s.removed.map((v, k) => <span key={`r${k}`} className="mr-2"><Removed>{v}</Removed></span>)}
                </p>
              ))}
            </div>
          )}
        </Card>
      ))}
      <More total={entries.length} shown={shown} onMore={() => setShown(shown + PAGE)} unit="건" />
    </div>
  )
}

function More({ total, shown, onMore, unit }) {
  if (total <= shown) return null
  return (
    <div className="pt-1 text-center">
      <p className="mb-2 text-xs text-[#9CA3AF]">{`${total}${unit} 중 ${shown}${unit} 표시 — 전체는 CSV로 내려받을 수 있습니다.`}</p>
      <Button variant="outline" onClick={onMore}>더 보기</Button>
    </div>
  )
}

export default function DiffTable({ diff, kind }) {
  const total = diff.added.length + diff.removed.length + diff.changed.length
  // 빈 표는 실패와 구분되지 않는다 — 차이가 없다는 것을 말로 한다.
  if (total === 0) return <p className="py-8 text-center text-sm text-[#6B7280]">차이가 없습니다.</p>
  return kind === 'intents' ? <IntentGroups diff={diff} /> : <FlatList diff={diff} />
}

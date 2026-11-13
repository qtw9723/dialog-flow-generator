import { useMemo, useRef, useState } from 'react'
import UploadZone from '../ui/UploadZone'
import { Button } from '../common/Button'
import Checkbox from '../ui/Checkbox'
import PageHeader from '../ui/PageHeader'
import { Card } from '../common/Card'
import DiffTable from './DiffTable'
import { parseCsv } from '../../lib/compare/parseCsv.js'
import { detectCsvKind } from '../../lib/compare/detectCsvKind.js'
import { diffRows, unionSetIndexes } from '../../lib/compare/diffRows.js'
import { diffToCsv, diffCsvFilename } from '../../lib/compare/diffToCsv.js'
import { fileWarnings } from '../../lib/compare/fileWarnings.js'
import { downloadCsv } from '../../lib/downloadFile.js'

// CSV 두 개를 비교한다. 서버 왕복이 없다 — 파일은 브라우저를 떠나지 않는다.

/** File을 읽어 파싱까지 끝낸 한쪽 상태를 만든다. */
async function readSide(file) {
  const parsed = parseCsv(await file.text())
  const detected = detectCsvKind(parsed.headers)
  const warnings = fileWarnings({ size: file.size, rowCount: parsed.rows.length })
  return { name: file.name, ...parsed, ...detected, warnings: [...warnings, ...parsed.warnings] }
}

/**
 * 헤더 이름을 화면 표시용으로 바꾼다. 빈 이름은 "(이름 없는 N번째 컬럼)"으로 —
 * 키 컬럼 선택 `<option>`과 컬럼 추가/삭제 표시가 같은 문구를 쓰도록 여기 한 곳에 둔다.
 * @param {string} name
 * @param {number} index 0-based
 * @returns {string}
 */
function headerLabel(name, index) {
  return name || `(이름 없는 ${index + 1}번째 컬럼)`
}

/**
 * columnsAdded/columnsRemoved의 헤더 이름을 화면용으로 바꾼다. diffRows는 이름만
 * 돌려주고 인덱스는 안 주므로(이름으로 중복 제거하는 namedColumns 구조상 빈 이름은
 * 많아야 하나만 보고됨), 빈 이름일 때만 실제 위치를 headers에서 되짚는다.
 * @param {string} name
 * @param {string[]} headers 추가는 after.headers, 삭제는 before.headers
 * @param {Set<number>} excluded 키·집합 컬럼 인덱스(비교에서 제외된 자리)
 * @returns {string}
 */
function labelForColumn(name, headers, excluded) {
  if (name) return name
  const idx = headers.findIndex((h, i) => h === '' && !excluded.has(i))
  return idx === -1 ? '(이름 없음)' : headerLabel(name, idx)
}

function SidePanel({ label, side, onFile, busy }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-[#374151]">{label}</p>
      {side ? (
        <Card className="p-4">
          <p className="mb-1 truncate text-sm font-medium text-[#1F2937]">{side.name}</p>
          <p className="text-xs text-[#6B7280]">
            <span className="mr-2 rounded bg-[#F3F4F6] px-2 py-0.5">{side.label}</span>
            {`${side.rows.length}행 · ${side.headers.length}컬럼`}
          </p>
          <button
            type="button"
            onClick={() => onFile(null)}
            className="mt-3 text-xs text-[#6B7280] underline hover:text-[#111827]"
          >
            다른 파일 고르기
          </button>
        </Card>
      ) : (
        <UploadZone
          onFile={onFile}
          accept=".csv,text/csv"
          loading={busy}
          title="CSV 파일을 끌어다 놓거나 클릭해서 선택하세요"
          hint="인텐트·엔티티 학습 데이터, ESD 업로드 CSV를 알아봅니다"
          icon="📑"
        />
      )}
    </div>
  )
}

export default function ComparePage() {
  const [before, setBefore] = useState(null)
  const [after, setAfter] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [ignoreLoose, setIgnoreLoose] = useState(false)
  const [keyIndexes, setKeyIndexes] = useState(null) // unknown일 때 사용자가 고른 키
  const [diff, setDiff] = useState(null)

  // 칸별 요청 토큰 — 같은 칸에 연속으로 드롭하면 늦게 시작한 읽기가 아니라
  // 늦게 "끝난" 읽기가 이겨야 한다. 끝났을 때 자기 토큰이 최신이 아니면 결과를 버린다.
  const requestIds = useRef({ before: 0, after: 0 })

  const pick = (setter, which) => async (file) => {
    setDiff(null)
    setError(null)
    // before 파일을 바꾸면(치우는 것 포함) 이전에 고른 키 선택은 새 파일과 무관해진다 —
    // 남겨두면 선택은 안 보이는데 effectiveKeys는 여전히 옛 값이라 조용히 틀린 비교가 된다.
    if (which === 'before') setKeyIndexes(null)
    const myId = ++requestIds.current[which]
    if (!file) { setter(null); return }
    setBusy(which)
    try {
      const side = await readSide(file)
      if (requestIds.current[which] !== myId) return // 이 사이에 더 새로운 읽기가 시작됐다 — 버린다
      setter(side)
    } catch (e) {
      if (requestIds.current[which] !== myId) return
      setError(`${which === 'before' ? '왼쪽' : '오른쪽'} 파일을 읽지 못했습니다: ${e?.message ?? e}`)
    } finally {
      if (requestIds.current[which] === myId) setBusy(null)
    }
  }

  const mismatch = before && after && before.kind !== after.kind
  const ready = before && after && !mismatch

  const effectiveKeys = useMemo(() => {
    if (!ready) return []
    if (before.kind === 'unknown') return keyIndexes ?? before.keyIndexes
    return before.keyIndexes
  }, [ready, before, keyIndexes])

  const run = () => {
    setError(null)
    try {
      // before/after 헤더 길이가 다르면(예: 동의어가 한쪽에 더 많음) 한쪽 setIndexes만
      // 쓰면 넓은 쪽의 나머지 칸이 집합 비교를 빠져나가 "이름 없는 컬럼 추가"로 샌다 —
      // 항상 양쪽 합집합을 넘긴다.
      const setIndexes = unionSetIndexes(before.setIndexes, after.setIndexes)
      setDiff(diffRows(before, after, {
        keyIndexes: effectiveKeys,
        setIndexes,
        ignoreCase: ignoreLoose,
        ignoreWhitespace: ignoreLoose,
      }))
    } catch (e) {
      setError(`비교하지 못했습니다: ${e?.message ?? e}`)
    }
  }

  const allWarnings = [
    ...(before?.warnings ?? []).map((w) => `왼쪽: ${w}`),
    ...(after?.warnings ?? []).map((w) => `오른쪽: ${w}`),
    ...(diff?.warnings ?? []),
  ]

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="데이터 비교"
        description="CSV 두 개를 넣으면 무엇이 추가·삭제·변경됐는지 보여줍니다. 파일은 브라우저를 떠나지 않습니다."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SidePanel label="이전 (기준)" side={before} onFile={pick(setBefore, 'before')} busy={busy === 'before'} />
        <SidePanel label="이후 (비교 대상)" side={after} onFile={pick(setAfter, 'after')} busy={busy === 'after'} />
      </div>

      {mismatch && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {`종류가 다릅니다 — 왼쪽은 ${before.label}, 오른쪽은 ${after.label}입니다.`}
        </p>
      )}

      {ready && before.kind === 'unknown' && (
        <div className="mt-4 rounded-md bg-[#F9FAFB] px-3 py-3 text-sm text-[#374151]">
          <p className="mb-2">
            {`아는 규격이 아닙니다. 1행을 헤더로 읽었습니다: ${before.headers.join(', ')}`}
          </p>
          <label className="block text-xs text-[#6B7280]">
            같은 행인지 판단할 키 컬럼
            <select
              multiple
              value={(keyIndexes ?? before.keyIndexes).map(String)}
              onChange={(e) => {
                setDiff(null) // 키 컬럼이 바뀌면 이전 결과는 새 설정과 무관해진다
                setKeyIndexes([...e.target.selectedOptions].map((o) => Number(o.value)))
              }}
              className="mt-1 block w-full rounded border border-[#E5E7EB] p-2 text-sm text-[#111827]"
            >
              {before.headers.map((h, i) => (
                <option key={i} value={i}>{headerLabel(h, i)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {ready && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Checkbox
            label="공백·대소문자 무시"
            checked={ignoreLoose}
            onChange={(e) => {
              setDiff(null) // 옵션이 바뀌면 이전 결과는 새 설정과 무관해진다
              setIgnoreLoose(e.target.checked)
            }}
          />
          <Button onClick={run} disabled={effectiveKeys.length === 0}>비교하기</Button>
        </div>
      )}

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {allWarnings.length > 0 && (
        <details className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <summary className="cursor-pointer">{`확인할 점 ${allWarnings.length}건`}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {allWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}

      {diff && (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#374151]">
              {`추가 ${diff.added.length} · 삭제 ${diff.removed.length} · 변경 ${diff.changed.length}`}
            </p>
            <Button
              variant="outline"
              onClick={() => downloadCsv(diffCsvFilename(before.kind), diffToCsv(diff))}
            >
              차이만 CSV로 내려받기
            </Button>
          </div>

          {/* 한쪽에만 있는 컬럼은 걸러내지 않고 보고한다 — 스펙이 요구하는 신호다.
              이름 없는 컬럼은 실제 위치를 찾아 "(이름 없는 N번째 컬럼)"으로 보인다
              (키 컬럼 선택 <option>과 같은 문구 — headerLabel/labelForColumn 참조). */}
          {(() => {
            const excluded = new Set([...effectiveKeys, ...unionSetIndexes(before.setIndexes, after.setIndexes)])
            const columnsAdded = diff.columnsAdded.map((name) => labelForColumn(name, after.headers, excluded))
            const columnsRemoved = diff.columnsRemoved.map((name) => labelForColumn(name, before.headers, excluded))
            if (columnsAdded.length === 0 && columnsRemoved.length === 0) return null
            return (
              <div className="mb-3 space-y-1 text-xs text-[#6B7280]">
                {columnsAdded.length > 0 && <p>{`컬럼 추가: ${columnsAdded.join(', ')}`}</p>}
                {columnsRemoved.length > 0 && <p>{`컬럼 삭제: ${columnsRemoved.join(', ')}`}</p>}
              </div>
            )
          })()}

          {/* key를 바꿔 새 비교마다 '더 보기' 상태를 처음으로 되돌린다 */}
          <DiffTable
            key={`${diff.added.length}-${diff.removed.length}-${diff.changed.length}`}
            diff={diff}
            kind={before.kind}
          />
        </section>
      )}
    </div>
  )
}

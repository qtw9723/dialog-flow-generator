import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResults } from '../../context/ResultsContext'
import { useAuth } from '../../context/AuthContext'
import { Card, CardBody } from '../common/Card'
import { FormInput } from '../common/FormInput'
import { Modal } from '../common/Modal'
import { ResultCard } from './ResultCard'
import {
  ARCHIVE_MODES, ARCHIVE_MODE_LABELS, filterByArchive, normalizeArchiveMode, archiveErrorMessage,
} from '../../lib/resultBundle/archiveFilter.js'

// 결과 생성자(사용자) — 없으면 '(미상)'
const userOf = (r) => (r.bundle?.created_by || '').trim() || '(미상)'

// 고른 칩을 기억한다. 저장소가 막힌 브라우저에서도 화면은 떠야 하므로 읽기·쓰기를 감싼다.
const ARCHIVE_MODE_KEY = 'resultsArchiveMode'

export const ResultsList = () => {
  const navigate = useNavigate()
  const { results, deleteResult, setResultArchived, refetch } = useResults()
  const { user, isAdmin } = useAuth()
  // 보관 표시는 테스터(본인 결과)와 관리자(전체 사용자의 결과)가 한다.
  // 2026-10-26 사용자 결정 "관리자는 다 볼 수 있게" — v0.10.0의 '본인 결과에만' 제한을 관리자에게는 풀었다.
  // 관리자 저장은 admin-results PATCH(v0.11.0 항목 6a, _shared/resultPatch.ts)가 처리한다.
  const canArchive = !!user || isAdmin
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [userFilter, setUserFilter] = useState('all')   // 사용자 필터
  const [groupByUser, setGroupByUser] = useState(false)  // 사용자별 그룹 토글
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [archiveMode, setArchiveMode] = useState(() => {
    try { return normalizeArchiveMode(localStorage.getItem(ARCHIVE_MODE_KEY)) } catch { return 'all' }
  })
  const [archiveError, setArchiveError] = useState(null)

  useEffect(() => {
    try { localStorage.setItem(ARCHIVE_MODE_KEY, archiveMode) } catch { /* 저장 실패는 무해하다 */ }
  }, [archiveMode])

  // 목록 신선도: 결과 상태는 앱 전체에 하나뿐인 ResultsProvider가 갖고 있고, 그 프로바이더는
  // 앱 생애에 딱 한 번만 자동 로드한다. 이 화면을 다시 열 때마다 서버에서 다시 읽지 않으면
  // 새로 만든 결과나 다른 화면 밖에서 바뀐 결과가 목록에 안 보인다 — 마운트마다 명시로 부른다.
  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 결과에 등장하는 사용자 목록(필터 드롭다운용)
  const users = useMemo(
    () => Array.from(new Set(results.map(userOf))).sort((a, b) => a.localeCompare(b, 'ko')),
    [results],
  )

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = results.filter(result =>
      (result.generated_json?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      && (userFilter === 'all' || userOf(result) === userFilter)
    )

    filtered = filterByArchive(filtered, archiveMode)

    if (sortBy === 'oldest') {
      filtered = filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    } else {
      filtered = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    return filtered
  }, [results, searchTerm, sortBy, userFilter, archiveMode])

  // 사용자별 그룹(토글 시) — 사용자 이름순 섹션
  const groupedByUser = useMemo(() => {
    if (!groupByUser) return null
    const map = new Map()
    for (const r of filteredResults) {
      const u = userOf(r)
      if (!map.has(u)) map.set(u, [])
      map.get(u).push(r)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([user, items]) => ({ user, items }))
  }, [groupByUser, filteredResults])

  const handleDelete = async (id) => {
    setDeleteConfirm(id)
  }

  const handleToggleArchive = async (id, next) => {
    setArchiveError(null)
    try {
      await setResultArchived(id, next)
    } catch (e) {
      setArchiveError(archiveErrorMessage(e))
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return

    setIsDeleting(true)
    try {
      await deleteResult(deleteConfirm)
      setDeleteConfirm(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleViewResult = (result) => {
    navigate(`/results/${result.id}`)
  }

  if (results.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="p-8 text-center">
          <p className="text-[#6B7280] mb-6">아직 생성된 결과가 없습니다</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-primary-500 mb-8">생성된 결과</h1>

      {/* Filters in a card */}
      <Card className="mb-6">
        <CardBody className="space-y-4">
          <FormInput
            id="search"
            name="search"
            placeholder="결과 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <FormInput
            id="sort"
            name="sort"
            type="select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'newest', label: '최신순' },
              { value: 'oldest', label: '오래된순' },
            ]}
          />

          <FormInput
            id="userFilter"
            name="userFilter"
            type="select"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            options={[
              { value: 'all', label: '전체 사용자' },
              ...users.map((u) => ({ value: u, label: `👤 ${u}` })),
            ]}
          />

          <label className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={groupByUser}
              onChange={(e) => setGroupByUser(e.target.checked)}
            />
            사용자별로 묶어 보기
          </label>
        </CardBody>
      </Card>

      <div className="flex gap-1.5 mb-4">
        {ARCHIVE_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setArchiveMode(mode)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              archiveMode === mode
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-[#F8FAFC]'
            }`}
          >
            {ARCHIVE_MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {archiveError && (
        <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm">
          {archiveError}
        </div>
      )}

      {/* Results — 사용자별 그룹 토글 시 섹션으로, 아니면 단일 그리드 */}
      {filteredResults.length === 0 ? (
        <div className="text-center py-8 text-[#6B7280]">결과가 없습니다.</div>
      ) : groupByUser ? (
        <div className="space-y-8">
          {groupedByUser.map(({ user, items }) => (
            <div key={user}>
              <h2 className="text-sm font-semibold text-[#374151] mb-3 flex items-center gap-2">
                👤 {user}
                <span className="text-xs font-normal text-[#9CA3AF]">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((result) => (
                  <ResultCard
                    key={result.id}
                    result={result}
                    onView={handleViewResult}
                    onDelete={handleDelete}
                    onToggleArchive={handleToggleArchive}
                    loading={isDeleting}
                    canArchive={canArchive}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResults.map((result) => (
            <ResultCard
              key={result.id}
              result={result}
              onView={handleViewResult}
              onDelete={handleDelete}
              onToggleArchive={handleToggleArchive}
              loading={isDeleting}
              canArchive={canArchive}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="결과 삭제 확인"
        buttons={[
          {
            label: '취소',
            onClick: () => setDeleteConfirm(null),
            variant: 'secondary'
          },
          {
            label: '삭제',
            onClick: handleConfirmDelete,
            variant: 'danger',
            disabled: isDeleting
          }
        ]}
      >
        <p className="text-[#6B7280]">
          선택한 결과를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
        </p>
      </Modal>
    </div>
  )
}

export default ResultsList

import { useState, useCallback } from 'react'
import { useSolutionRules } from '../context/SolutionRulesContext'
import { AdminLayout } from './AdminLayout'
import { Card, CardBody } from './common/Card'
import { Button } from './common/Button'
import { FormInput } from './common/FormInput'
import { SOLUTION_RULE_CATEGORIES } from '../lib/constants'
import RuleLearning from './admin/RuleLearning'
import { formatKST } from '../utils/datetime'

const CATEGORIES = SOLUTION_RULE_CATEGORIES

// Helper to convert UI category ID to database category name
const getCategoryDbName = (uiCategoryId) => {
  const category = CATEGORIES.find(c => c.id === uiCategoryId)
  return category ? category.dbName : uiCategoryId
}

export default function SolutionRulesManager() {
  const { rules, loading, error: fetchError, createRule, updateRule, deleteRule, refetch } = useSolutionRules()

  const [show, setShow] = useState(false)
  const [editId, setEditId] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('solution_rules')
  const [inputMode, setInputMode] = useState('text') // 'text' or 'json'
  const [form, setForm] = useState({ category: 'solution_rules', title: '', description: '', text: '', content: null })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()

    // Prevent duplicate submissions
    if (isSubmitting) return

    setError('')
    setIsSubmitting(true)

    try {
      if (!form.title || !form.title.trim()) {
        throw new Error('제목은 필수입니다')
      }
      if (!form.category) {
        throw new Error('카테고리는 필수입니다')
      }
      if (!form.description || !form.description.trim()) {
        throw new Error('설명은 필수입니다. 이 내용이 생성 프롬프트에 주입되는 규칙 본문입니다')
      }

      const ruleData = {
        category: getCategoryDbName(form.category),
        title: form.title.trim(),
        description: form.description.trim()
      }

      // Send text or content depending on input mode
      if (inputMode === 'text' && form.text) {
        ruleData.text = form.text  // API will convert to JSON
      } else if (inputMode === 'json' && form.content) {
        ruleData.content = form.content
      } else {
        throw new Error('규칙 내용을 입력해주세요')
      }

      if (editId) {
        await updateRule(ruleData.category, editId, ruleData)
        setEditId(null)
      } else {
        await createRule(ruleData.category, ruleData)
      }

      setForm({ category: 'solution_rules', title: '', description: '', text: '', content: null })
      setInputMode('text')
      setShow(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }, [form, editId, inputMode, createRule, updateRule, isSubmitting])

  const handleEdit = useCallback((rule) => {
    setForm({
      category: selectedCategory,
      title: rule.title,
      description: rule.description || '',
      text: '',
      content: rule.content ? (typeof rule.content === 'string' ? JSON.parse(rule.content) : rule.content) : null
    })
    setInputMode('json')  // Show as JSON when editing
    setEditId(rule.id)
    setShow(true)
  }, [selectedCategory])

  const handleCancel = useCallback(() => {
    setShow(false)
    setEditId(null)
    setForm({ category: 'solution_rules', title: '', description: '', text: '', content: null })
    setInputMode('text')
    setError('')
  }, [])

  const handleAddClick = useCallback(() => {
    setEditId(null)
    setForm({ category: selectedCategory, title: '', description: '', text: '', content: null })
    setInputMode('text')
    setError('')
    setShow(true)
  }, [selectedCategory])

  const handleDelete = useCallback(async (rule) => {
    if (window.confirm(`"${rule.title}" 규칙을 삭제하시겠습니까?`)) {
      try {
        await deleteRule(getCategoryDbName(selectedCategory), rule.id)
      } catch (err) {
        setError(`삭제 실패: ${err.message}`)
      }
    }
  }, [selectedCategory, deleteRule])

  const currentRules = rules[getCategoryDbName(selectedCategory)] || []

  return (
    <AdminLayout title="솔루션 규칙">
      {/* 상단: 규칙 학습(정합화) 패널 — 적용 시 아래 목록 자동 새로고침 */}
      <RuleLearning onApplied={refetch} />

      <div className="border-t border-[#E5E7EB]" />

      {fetchError && (
        <Card className="border-l-4 border-l-[#EF4444] bg-[#FEE2E2]">
          <CardBody className="flex items-center justify-between">
            <span className="text-[#DC2626]">{fetchError}</span>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              다시 시도
            </Button>
          </CardBody>
        </Card>
      )}

      {error && (
        <Card className="border-l-4 border-l-[#EF4444] bg-[#FEE2E2]">
          <CardBody>
            <span className="text-[#DC2626]">{error}</span>
          </CardBody>
        </Card>
      )}

      {/* Category Tabs */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-x-2 gap-y-1 border-b border-[#E5E7EB] pb-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id)
                  setShow(false)
                  setEditId(null)
                }}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  selectedCategory === cat.id
                    ? 'border-b-2 border-primary-500 text-primary-500'
                    : 'text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {!loading && !fetchError && !show && (
        <Button onClick={handleAddClick}>
          + 규칙 추가
        </Button>
      )}

      {show && (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="rule-category" className="mb-2 block text-sm font-semibold text-[#1F2937]">
                  카테고리
                </label>
                <select
                  id="rule-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <FormInput
                id="rule-title"
                name="rule-title"
                label="제목"
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="예: 기본 솔루션 규칙"
                required
              />

              <FormInput
                id="rule-description"
                name="rule-description"
                label="설명"
                type="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="이 규칙에 대한 설명"
              />

              <div className="space-y-2">
                <label className="mb-2 block text-sm font-semibold text-[#1F2937]">
                  규칙 내용
                </label>

                {/* Input mode selector */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setInputMode('text')}
                    className={`px-3 py-1 text-sm rounded ${
                      inputMode === 'text'
                        ? 'bg-primary-500 text-white'
                        : 'bg-[#E5E7EB] text-[#1F2937]'
                    }`}
                  >
                    📝 자유 텍스트
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('json')}
                    className={`px-3 py-1 text-sm rounded ${
                      inputMode === 'json'
                        ? 'bg-primary-500 text-white'
                        : 'bg-[#E5E7EB] text-[#1F2937]'
                    }`}
                  >
                    {} JSON
                  </button>
                </div>

                {/* Text input (auto-converts to JSON) */}
                {inputMode === 'text' && (
                  <textarea
                    value={form.text}
                    onChange={(e) => setForm({ ...form, text: e.target.value, content: null })}
                    placeholder="규칙을 자유로운 텍스트로 설명해주세요. AI가 자동으로 JSON으로 변환합니다.&#10;&#10;예: '모든 예산은 숫자여야 하고, 포함된 항목은 배열 형식이어야 한다'"
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    rows="8"
                  />
                )}

                {/* JSON input (for advanced users) */}
                {inputMode === 'json' && (
                  <textarea
                    value={form.content ? JSON.stringify(form.content, null, 2) : ''}
                    onChange={(e) => {
                      try {
                        const parsed = e.target.value ? JSON.parse(e.target.value) : null
                        setForm({ ...form, content: parsed, text: '' })
                      } catch {
                        // Allow invalid JSON while editing
                        setForm({ ...form, text: '' })
                      }
                    }}
                    placeholder="JSON 형식으로 직접 입력하세요.&#10;&#10;예: [&#10;  { &#34;key&#34;: &#34;budget&#34;, &#34;type&#34;: &#34;number&#34;, &#34;description&#34;: &#34;예산 금액&#34; }&#10;]"
                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    rows="8"
                  />
                )}

                <p className="text-xs text-[#6B7280]">
                  {inputMode === 'text'
                    ? '💡 자유 텍스트를 입력하면 AI가 자동으로 JSON으로 변환합니다'
                    : '⚙️ 고급 사용자용 JSON 직접 입력 모드'}
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? '처리중...' : editId ? '수정' : '추가'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>
                  취소
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-12 text-[#6B7280]">로딩 중...</div>
      ) : currentRules.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-[#6B7280]">아직 규칙이 없습니다.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {currentRules.map((rule) => (
            <Card
              key={rule.id}
              className={editId === rule.id ? 'ring-2 ring-primary-500 bg-[#F0F9FF]' : ''}
            >
              <CardBody className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-[#1F2937]">{rule.title}</p>
                  {rule.description && (
                    <p className="text-sm text-[#6B7280] mt-1">
                      {rule.description}
                    </p>
                  )}
                  <p className="text-xs text-[#9CA3AF] mt-2">
                    {formatKST(rule.created_at, { fallback: '날짜 정보 없음' })}
                  </p>
                  {rule.content && (
                    <div className="mt-3 bg-[#F9FAFB] rounded p-2 text-xs font-mono text-[#6B7280] overflow-auto max-h-32">
                      {typeof rule.content === 'string' ? rule.content : JSON.stringify(rule.content, null, 2)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4 flex-shrink-0">
                  <Button size="sm" onClick={() => handleEdit(rule)}>
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(rule)}
                  >
                    삭제
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}

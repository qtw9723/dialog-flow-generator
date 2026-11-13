import { useState } from 'react'
import { useQuestions } from '../context/QuestionsContext'
import { useTemplates } from '../context/TemplatesContext'
import { INPUT_TYPES, STRUCTURED_FIELD_TYPES, QUESTION_ROLES, QUESTION_ROLE_LABELS, QUESTION_ROLE_DESCRIPTIONS } from '../lib/constants'
import { AdminLayout } from './AdminLayout'
import { Card, CardBody } from './common/Card'
import { Button } from './common/Button'
import { FormInput } from './common/FormInput'

export default function QuestionManager() {
  const { questions, loading, error: fetchError, createQuestion, updateQuestion, deleteQuestion, refetch } = useQuestions()
  const { templates, loading: templatesLoading, error: templatesError } = useTemplates()

  const [show, setShow] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    text: '',
    input_type: INPUT_TYPES.TEXT,
    is_required: true,
    options: [],
    fields: [],
    template_id: null,
    order_index: 0,
    question_role: QUESTION_ROLES.REQUIRED_CONTEXT
  })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        await updateQuestion(editId, form)
        setEditId(null)
      } else {
        await createQuestion(form)
      }
      setForm({
        text: '',
        input_type: INPUT_TYPES.TEXT,
        is_required: true,
        options: [],
        fields: [],
        template_id: null,
        order_index: 0,
        question_role: QUESTION_ROLES.REQUIRED_CONTEXT
      })
      setShow(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (q) => {
    setForm(q)
    setEditId(q.id)
    setShow(true)
  }

  const handleCancel = () => {
    setShow(false)
    setEditId(null)
    setForm({
      text: '',
      input_type: INPUT_TYPES.TEXT,
      is_required: true,
      options: [],
      fields: [],
      template_id: null,
      order_index: 0,
      question_role: QUESTION_ROLES.REQUIRED_CONTEXT
    })
  }

  return (
    <AdminLayout title="질문 관리">

      {/* Error Messages */}
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

      {/* Add Button */}
      {!loading && !fetchError && !show && (
        <Button onClick={() => setShow(true)}>
          + 질문 추가
        </Button>
      )}

      {/* Form Card */}
      {show && (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormInput
                id="question-text"
                name="question-text"
                label="질문 텍스트"
                type="text"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="질문을 입력해주세요"
                required
              />

              <FormInput
                id="input-type"
                name="input_type"
                type="select"
                label="입력 타입"
                value={form.input_type}
                onChange={(e) => setForm({ ...form, input_type: e.target.value })}
                options={[
                  { value: INPUT_TYPES.TEXT, label: '텍스트' },
                  { value: INPUT_TYPES.TEXTAREA, label: '여러 줄' },
                  { value: INPUT_TYPES.SELECT, label: '선택지' },
                  { value: INPUT_TYPES.STRUCTURED, label: '구조화된 필드' },
                  { value: INPUT_TYPES.TEMPLATED, label: '템플릿' }
                ]}
                required
              />

              {form.input_type === INPUT_TYPES.SELECT && (
                <div className="space-y-2">
                  <label className="mb-2 block text-sm font-semibold text-[#1F2937]">
                    선택지
                  </label>
                  <div className="space-y-2">
                    {form.options.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...form.options]
                            newOptions[index] = e.target.value
                            setForm({ ...form, options: newOptions })
                          }}
                          placeholder={`선택지 ${index + 1}`}
                          className="flex-1 rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        />
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            const newOptions = form.options.filter((_, i) => i !== index)
                            setForm({ ...form, options: newOptions })
                          }}
                        >
                          삭제
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setForm({ ...form, options: [...form.options, ''] })}
                  >
                    + 선택지 추가
                  </Button>
                </div>
              )}

              {form.input_type === INPUT_TYPES.TEMPLATED && (
                <FormInput
                  id="template-select"
                  name="template_select"
                  type="select"
                  label="템플릿 선택"
                  value={form.template_id || ''}
                  onChange={(e) => {
                    setForm({
                      ...form,
                      template_id: e.target.value,
                    })
                  }}
                  options={templates.map(t => ({ value: t.id, label: t.name }))}
                  required
                />
              )}

              {form.input_type === INPUT_TYPES.STRUCTURED && (
                <div className="space-y-2">
                  <label className="mb-2 block text-sm font-semibold text-[#1F2937]">
                    입력 필드
                  </label>
                  <div className="space-y-2">
                    {form.fields.map((field, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => {
                            const newFields = [...form.fields]
                            newFields[index] = { ...field, name: e.target.value }
                            setForm({ ...form, fields: newFields })
                          }}
                          placeholder={`필드명 (예: 시나리오)`}
                          className="flex-1 rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        />
                        <select
                          value={field.type || 'textarea'}
                          onChange={(e) => {
                            const newFields = [...form.fields]
                            newFields[index] = { ...field, type: e.target.value }
                            setForm({ ...form, fields: newFields })
                          }}
                          className="rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        >
                          <option value="text">한 줄</option>
                          <option value="textarea">여러 줄</option>
                        </select>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            const newFields = form.fields.filter((_, i) => i !== index)
                            setForm({ ...form, fields: newFields })
                          }}
                        >
                          삭제
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setForm({ ...form, fields: [...form.fields, { name: '', type: 'textarea' }] })}
                  >
                    + 필드 추가
                  </Button>
                </div>
              )}

              <FormInput
                id="is-required"
                name="is_required"
                type="checkbox"
                label="필수"
                checked={form.is_required}
                onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
              />

              <FormInput
                id="question-role"
                name="question_role"
                type="select"
                label="질문 역할 (생성 시 프롬프트 구성에 사용됩니다)"
                value={form.question_role}
                onChange={(e) => setForm({ ...form, question_role: e.target.value })}
                options={[
                  { value: QUESTION_ROLES.REQUIRED_CONTEXT, label: `${QUESTION_ROLE_LABELS.required_context} - ${QUESTION_ROLE_DESCRIPTIONS.required_context}` },
                  { value: QUESTION_ROLES.OPTIONAL_CONTEXT, label: `${QUESTION_ROLE_LABELS.optional_context} - ${QUESTION_ROLE_DESCRIPTIONS.optional_context}` },
                  { value: QUESTION_ROLES.CONSTRAINT, label: `${QUESTION_ROLE_LABELS.constraint} - ${QUESTION_ROLE_DESCRIPTIONS.constraint}` },
                  { value: QUESTION_ROLES.INTENT, label: `${QUESTION_ROLE_LABELS.intent} - ${QUESTION_ROLE_DESCRIPTIONS.intent}` },
                  { value: QUESTION_ROLES.PREFERENCE, label: `${QUESTION_ROLE_LABELS.preference} - ${QUESTION_ROLE_DESCRIPTIONS.preference}` }
                ]}
                required
              />

              <div className="flex gap-2 pt-4">
                <Button type="submit">
                  {editId ? '수정' : '추가'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancel}>
                  취소
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Questions List */}
      {loading ? (
        <div className="text-center py-12 text-[#6B7280]">로딩 중...</div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Card
              key={q.id}
              className={editId === q.id ? 'ring-2 ring-primary-500 bg-[#F0F9FF]' : ''}
            >
              <CardBody className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-[#1F2937]">{q.text}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <p className="text-sm text-[#6B7280]">
                      타입: {q.input_type} | 필수: {q.is_required ? '예' : '아니오'}
                    </p>
                    <span className="inline-block px-2 py-1 bg-[#DBEAFE] text-primary-500 text-xs font-semibold rounded">
                      역할: {QUESTION_ROLE_LABELS[q.question_role] || '미지정'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button size="sm" onClick={() => handleEdit(q)}>
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm('이 질문을 삭제하시겠습니까?')) deleteQuestion(q.id)
                    }}
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

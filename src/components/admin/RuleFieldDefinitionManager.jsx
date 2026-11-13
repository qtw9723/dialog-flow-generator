import { useState } from 'react'
import { Card, CardBody } from '../common/Card'
import { Button } from '../common/Button'
import { FormInput } from '../common/FormInput'

export const RuleFieldDefinitionManager = ({
  referenceId,
  fieldDefinitions = [],
  onAdd,
  onUpdate,
  onDelete,
  loading = false,
  error = null,
}) => {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    json_path: '',
    field_name: '',
    field_type: 'string',
    is_required: true,
    description: '',
    enum_values: '',
    pattern: '',
    min_value: '',
    max_value: '',
  })
  const [formError, setFormError] = useState('')

  const fieldTypeOptions = [
    { value: 'string', label: '문자열 (String)' },
    { value: 'number', label: '숫자 (Number)' },
    { value: 'boolean', label: '불린 (Boolean)' },
    { value: 'array', label: '배열 (Array)' },
    { value: 'object', label: '객체 (Object)' },
  ]

  const handleAddClick = () => {
    setEditingId(null)
    setForm({
      json_path: '',
      field_name: '',
      field_type: 'string',
      is_required: true,
      description: '',
      enum_values: '',
      pattern: '',
      min_value: '',
      max_value: '',
    })
    setFormError('')
    setShowForm(true)
  }

  const handleEditClick = (definition) => {
    setEditingId(definition.id)
    setForm({
      json_path: definition.json_path,
      field_name: definition.field_name,
      field_type: definition.field_type,
      is_required: definition.is_required,
      description: definition.description || '',
      enum_values: definition.enum_values?.join(',') || '',
      pattern: definition.pattern || '',
      min_value: definition.min_value || '',
      max_value: definition.max_value || '',
    })
    setFormError('')
    setShowForm(true)
  }

  const validateForm = () => {
    if (!form.json_path.trim()) {
      setFormError('JSON 경로는 필수입니다')
      return false
    }
    if (!form.field_name.trim()) {
      setFormError('필드명은 필수입니다')
      return false
    }
    if (!form.field_type) {
      setFormError('필드 타입은 필수입니다')
      return false
    }
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    const payload = {
      reference_id: referenceId,
      json_path: form.json_path.trim(),
      field_name: form.field_name.trim(),
      field_type: form.field_type,
      is_required: form.is_required,
      description: form.description.trim() || null,
      enum_values: form.enum_values
        ? form.enum_values.split(',').map(v => v.trim()).filter(v => v)
        : [],
      pattern: form.pattern.trim() || null,
      min_value: form.min_value ? parseFloat(form.min_value) : null,
      max_value: form.max_value ? parseFloat(form.max_value) : null,
    }

    if (editingId) {
      onUpdate(editingId, payload)
    } else {
      onAdd(payload)
    }

    setShowForm(false)
    setFormError('')
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormError('')
  }

  const handleDelete = (id) => {
    if (window.confirm('이 필드 정의를 삭제하시겠습니까?')) {
      onDelete(id)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
          <p className="text-sm text-[#6B7280] mt-2">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-l-4 border-l-[#EF4444] bg-[#FEE2E2]">
          <CardBody>
            <p className="text-[#DC2626] font-semibold">오류 발생</p>
            <p className="text-[#DC2626] text-sm mt-1">{error}</p>
          </CardBody>
        </Card>
      )}

      {!showForm && (
        <Button onClick={handleAddClick} variant="default">
          + 필드 정의 추가
        </Button>
      )}

      {showForm && (
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-[#1F2937] mb-4">
              {editingId ? '필드 정의 수정' : '새 필드 정의'}
            </h3>

            {formError && (
              <div className="mb-4 p-3 bg-[#FEE2E2] border border-[#FECACA] rounded text-[#DC2626] text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormInput
                id="json_path"
                name="json_path"
                label="JSON 경로"
                type="text"
                value={form.json_path}
                onChange={(e) => setForm({ ...form, json_path: e.target.value })}
                placeholder="예: dialogs[0].nodes[].label"
                required
              />

              <FormInput
                id="field_name"
                name="field_name"
                label="필드명"
                type="text"
                value={form.field_name}
                onChange={(e) => setForm({ ...form, field_name: e.target.value })}
                placeholder="예: label"
                required
              />

              <FormInput
                id="field_type"
                name="field_type"
                label="필드 타입"
                type="select"
                value={form.field_type}
                onChange={(e) => setForm({ ...form, field_type: e.target.value })}
                options={fieldTypeOptions}
                required
              />

              <div className="flex items-center gap-2">
                <input
                  id="is_required"
                  type="checkbox"
                  checked={form.is_required}
                  onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                  className="h-4 w-4 accent-primary-500 cursor-pointer"
                />
                <label htmlFor="is_required" className="text-sm font-semibold text-[#1F2937] cursor-pointer">
                  필수 필드
                </label>
              </div>

              <FormInput
                id="description"
                name="description"
                label="설명"
                type="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="필드에 대한 설명을 입력하세요"
              />

              <FormInput
                id="enum_values"
                name="enum_values"
                label="열거형 값 (쉼표로 구분)"
                type="textarea"
                value={form.enum_values}
                onChange={(e) => setForm({ ...form, enum_values: e.target.value })}
                placeholder="예: small, medium, large"
              />

              <FormInput
                id="pattern"
                name="pattern"
                label="정규식 패턴"
                type="text"
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                placeholder="예: ^[a-z]+$"
              />

              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  id="min_value"
                  name="min_value"
                  label="최소값"
                  type="number"
                  value={form.min_value}
                  onChange={(e) => setForm({ ...form, min_value: e.target.value })}
                />

                <FormInput
                  id="max_value"
                  name="max_value"
                  label="최대값"
                  type="number"
                  value={form.max_value}
                  onChange={(e) => setForm({ ...form, max_value: e.target.value })}
                />
              </div>

              <div className="flex gap-2 pt-4 border-t border-[#E5E7EB]">
                <Button type="submit" variant="default">
                  {editingId ? '수정' : '추가'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                >
                  취소
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Table of existing field definitions */}
      {fieldDefinitions.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-[#1F2937] mb-4">
              필드 정의 목록 ({fieldDefinitions.length}개)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E7EB]">
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      JSON 경로
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      필드명
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      타입
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-[#6B7280]">
                      필수
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      설명
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-[#6B7280]">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fieldDefinitions.map((def) => (
                    <tr key={def.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                      <td className="py-3 px-4">
                        <code className="bg-[#F3F4F6] px-2 py-1 rounded text-xs text-[#1F2937] font-mono">
                          {def.json_path}
                        </code>
                      </td>
                      <td className="py-3 px-4 text-[#1F2937] font-medium">
                        {def.field_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block bg-[#DBEAFE] text-[#1E40AF] px-2 py-1 rounded text-xs font-medium">
                          {def.field_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {def.is_required ? (
                          <span className="text-[#059669] font-semibold">✓</span>
                        ) : (
                          <span className="text-[#6B7280]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#6B7280] text-xs max-w-xs truncate" title={def.description}>
                        {def.description || '—'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEditClick(def)}
                        >
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(def.id)}
                        >
                          삭제
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {fieldDefinitions.length === 0 && !showForm && (
        <Card className="bg-[#FFFBEB] border-l-4 border-l-[#FBBF24]">
          <CardBody>
            <p className="text-[#92400E] font-semibold">아직 정의된 필드가 없습니다.</p>
            <p className="text-[#92400E] text-sm mt-1">
              "필드 정의 추가" 버튼으로 새로운 필드를 정의해주세요.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export default RuleFieldDefinitionManager

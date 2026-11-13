import { useState } from 'react'
import { useTemplates } from '../context/TemplatesContext'
import { AdminLayout } from './AdminLayout'
import { Card, CardBody } from './common/Card'
import { Button } from './common/Button'
import { FormInput } from './common/FormInput'
import { TemplateFieldEditor } from './admin/TemplateFieldEditor'

export default function TemplateManager() {
  const { templates, loading, error: fetchError, createTemplate, updateTemplate, deleteTemplate, refetch } = useTemplates()

  const [show, setShow] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', fields: [] })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (!form.name) {
        throw new Error('템플릿 이름은 필수입니다')
      }
      if (form.fields.length === 0) {
        throw new Error('최소 하나의 필드는 추가해야 합니다')
      }

      if (editId) {
        await updateTemplate(editId, form)
        setEditId(null)
      } else {
        await createTemplate(form)
      }
      setForm({ name: '', description: '', fields: [] })
      setShow(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (template) => {
    setForm(template)
    setEditId(template.id)
    setShow(true)
  }

  const handleCancel = () => {
    setShow(false)
    setEditId(null)
    setForm({ name: '', description: '', fields: [] })
  }

  return (
    <AdminLayout title="템플릿 관리">
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

      {!loading && !fetchError && !show && (
        <Button onClick={() => setShow(true)}>
          + 템플릿 추가
        </Button>
      )}

      {show && (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormInput
                id="template-name"
                name="template-name"
                label="템플릿 이름"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 시나리오 분석"
                required
              />

              <FormInput
                id="template-description"
                name="template-description"
                label="설명"
                type="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="이 템플릿에 대한 설명"
              />

              {/* Template Fields Management */}
              <div className="space-y-2">
                <label className="mb-2 block text-sm font-semibold text-[#1F2937]">필드</label>
                <div className="space-y-2">
                  {form.fields.map((field, index) => (
                    <TemplateFieldEditor
                      key={index}
                      field={field}
                      onChange={(updated) => {
                        const newFields = [...form.fields]
                        newFields[index] = updated
                        setForm({ ...form, fields: newFields })
                      }}
                      onRemove={() => setForm({ ...form, fields: form.fields.filter((_, i) => i !== index) })}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setForm({ ...form, fields: [...form.fields, { name: '', type: 'text', required: true }] })}
                >
                  + 필드 추가
                </Button>
              </div>

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

      {loading ? (
        <div className="text-center py-12 text-[#6B7280]">로딩 중...</div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              className={editId === template.id ? 'ring-2 ring-primary-500 bg-[#F0F9FF]' : ''}
            >
              <CardBody className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-[#1F2937]">{template.name}</p>
                  <p className="text-sm text-[#6B7280] mt-1">
                    {template.description}
                  </p>
                  <p className="text-xs text-[#9CA3AF] mt-2">
                    필드 개수: {template.fields?.length || 0}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button size="sm" onClick={() => handleEdit(template)}>
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm('이 템플릿을 삭제하시겠습니까?')) deleteTemplate(template.id)
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

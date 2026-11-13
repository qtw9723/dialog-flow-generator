import { useState, useMemo } from 'react'
import { Card, CardBody } from '../common/Card'
import { Button } from '../common/Button'
import { FormInput } from '../common/FormInput'

export const RuleTemplateSelector = ({
  templates = [],
  onSelect,
  loading = false,
  error = null,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [params, setParams] = useState({})

  // Group templates by rule_type
  const groupedTemplates = useMemo(() => {
    const groups = {}
    templates.forEach(template => {
      if (!groups[template.rule_type]) {
        groups[template.rule_type] = []
      }
      groups[template.rule_type].push(template)
    })
    return groups
  }, [templates])

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  const handleSelectTemplate = (template) => {
    setSelectedTemplateId(template.id)
    setParams({})
  }

  const handleConfirm = () => {
    if (selectedTemplate && onSelect) {
      onSelect(selectedTemplate, params)
      setSelectedTemplateId(null)
      setParams({})
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

  if (error) {
    return (
      <Card className="border-l-4 border-l-[#EF4444] bg-[#FEE2E2]">
        <CardBody>
          <p className="text-[#DC2626] font-semibold">오류 발생</p>
          <p className="text-[#DC2626] text-sm mt-1">{error}</p>
        </CardBody>
      </Card>
    )
  }

  if (Object.keys(groupedTemplates).length === 0) {
    return (
      <Card className="border-l-4 border-l-[#F59E0B] bg-[#FEF3C7]">
        <CardBody>
          <p className="text-[#92400E]">사용 가능한 템플릿이 없습니다.</p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedTemplates).map(([ruleType, typeTemplates]) => (
        <div key={ruleType}>
          <h3 className="text-lg font-semibold text-[#1F2937] mb-3">
            {ruleType.charAt(0).toUpperCase() + ruleType.slice(1)} 규칙
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {typeTemplates.map(template => (
              <Card
                key={template.id}
                className={`cursor-pointer transition ${
                  selectedTemplateId === template.id
                    ? 'border-2 border-primary-500 bg-[#EFF6FF]'
                    : 'border border-[#E5E7EB] hover:border-primary-500'
                }`}
                onClick={() => handleSelectTemplate(template)}
              >
                <CardBody>
                  <h4 className="font-semibold text-[#1F2937] line-clamp-2">
                    {template.name}
                  </h4>
                  {template.description && (
                    <p className="text-sm text-[#6B7280] mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  {template.category && (
                    <div className="mt-3">
                      <span className="inline-block bg-[#E5E7EB] text-[#374151] px-2 py-1 rounded text-xs font-medium">
                        {template.category}
                      </span>
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {selectedTemplate && (
        <Card className="border-2 border-primary-500 bg-[#EFF6FF]">
          <CardBody>
            <h4 className="font-semibold text-[#1F2937] mb-4">
              선택된 템플릿: {selectedTemplate.name}
            </h4>

            {selectedTemplate.description && (
              <p className="text-sm text-[#6B7280] mb-4">{selectedTemplate.description}</p>
            )}

            {/* Example config preview */}
            {selectedTemplate.example_config && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-[#6B7280] mb-2">
                  예제 설정:
                </p>
                <pre className="bg-[#F8FAFC] border border-[#D1D5DB] p-3 rounded text-xs overflow-x-auto text-[#374151]">
                  {JSON.stringify(selectedTemplate.example_config, null, 2)}
                </pre>
              </div>
            )}

            {/* Parameter input form based on rule_type */}
            <div className="space-y-3 mb-4">
              {selectedTemplate.rule_type === 'template' && (
                <>
                  <FormInput
                    id="template-string"
                    name="template-string"
                    label="템플릿 문자열"
                    type="textarea"
                    value={params.templateString || ''}
                    onChange={(e) =>
                      setParams({ ...params, templateString: e.target.value })
                    }
                    placeholder='예: "안녕하세요 ${name}님"'
                    required
                  />
                  <FormInput
                    id="template-variables"
                    name="template-variables"
                    label="변수 목록 (쉼표로 구분)"
                    type="text"
                    value={params.variables || ''}
                    onChange={(e) =>
                      setParams({ ...params, variables: e.target.value })
                    }
                    placeholder="예: name, age, email"
                    required={false}
                  />
                </>
              )}

              {selectedTemplate.rule_type === 'function' && (
                <>
                  <FormInput
                    id="function-code"
                    name="function-code"
                    label="함수 코드"
                    type="textarea"
                    value={params.functionCode || ''}
                    onChange={(e) =>
                      setParams({ ...params, functionCode: e.target.value })
                    }
                    placeholder="return responses['q1'] + responses['q2']"
                    required
                  />
                  <FormInput
                    id="function-dependencies"
                    name="function-dependencies"
                    label="의존성 필드 (쉼표로 구분)"
                    type="text"
                    value={params.dependencies || ''}
                    onChange={(e) =>
                      setParams({ ...params, dependencies: e.target.value })
                    }
                    placeholder="예: q1, q2, q3"
                    required={false}
                  />
                </>
              )}

              {selectedTemplate.rule_type === 'direct' && (
                <FormInput
                  id="direct-value"
                  name="direct-value"
                  label="직접 값"
                  type="text"
                  value={params.directValue || ''}
                  onChange={(e) =>
                    setParams({ ...params, directValue: e.target.value })
                  }
                  placeholder="예: fixed_value_123"
                  required={false}
                />
              )}

              {selectedTemplate.rule_type === 'conditional' && (
                <>
                  <FormInput
                    id="condition-expression"
                    name="condition-expression"
                    label="조건 표현식"
                    type="textarea"
                    value={params.condition || ''}
                    onChange={(e) =>
                      setParams({ ...params, condition: e.target.value })
                    }
                    placeholder="예: responses['age'] > 18"
                    required
                  />
                  <FormInput
                    id="true-value"
                    name="true-value"
                    label="참일 때의 값"
                    type="text"
                    value={params.trueValue || ''}
                    onChange={(e) =>
                      setParams({ ...params, trueValue: e.target.value })
                    }
                    placeholder="예: adult"
                    required={false}
                  />
                  <FormInput
                    id="false-value"
                    name="false-value"
                    label="거짓일 때의 값"
                    type="text"
                    value={params.falseValue || ''}
                    onChange={(e) =>
                      setParams({ ...params, falseValue: e.target.value })
                    }
                    placeholder="예: minor"
                    required={false}
                  />
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="default"
                onClick={handleConfirm}
              >
                이 템플릿 사용
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSelectedTemplateId(null)
                  setParams({})
                }}
              >
                취소
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export default RuleTemplateSelector

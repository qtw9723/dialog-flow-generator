import { useState } from 'react'
import { Card, CardBody } from '../common/Card'
import { Button } from '../common/Button'
import { FormInput } from '../common/FormInput'
import { RuleTemplateSelector } from './RuleTemplateSelector'

export const RuleValueGeneratorManager = ({
  referenceId,
  templates = [],
  valueGenerators = [],
  onAdd,
  onUpdate,
  onDelete,
  loading = false,
  error = null,
}) => {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [ruleConfig, setRuleConfig] = useState({})
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  const handleSelectTemplate = (template, params) => {
    setSelectedTemplate(template)
    setShowTemplateSelector(false)

    // Initialize ruleConfig based on template type
    const initialConfig = {
      ...params,
      variables: {}
    }
    setRuleConfig(initialConfig)
  }

  const handleCreateRule = () => {
    if (!selectedTemplate || !ruleConfig.json_path) {
      alert('JSON 경로를 입력해주세요')
      return
    }

    const payload = {
      reference_id: referenceId,
      template_id: selectedTemplate.id,
      json_path: ruleConfig.json_path,
      rule_type: selectedTemplate.rule_type,
      rule_config: ruleConfig,
      order_index: valueGenerators.length,
      enabled: true,
    }

    onAdd(payload)
    setSelectedTemplate(null)
    setRuleConfig({})
  }

  const handleEditRule = (rule) => {
    setEditingId(rule.id)
    const template = templates.find(t => t.id === rule.template_id)
    setSelectedTemplate(template)
    setRuleConfig(rule.rule_config)
    setShowTemplateSelector(false)
  }

  const handleUpdateRule = () => {
    if (!ruleConfig.json_path) {
      alert('JSON 경로를 입력해주세요')
      return
    }

    const payload = {
      json_path: ruleConfig.json_path,
      rule_config: ruleConfig,
      enabled: ruleConfig.enabled,
    }

    onUpdate(editingId, payload)
    setEditingId(null)
    setSelectedTemplate(null)
    setRuleConfig({})
  }

  const handleToggleEnabled = (rule) => {
    onUpdate(rule.id, { enabled: !rule.enabled })
  }

  const handleChangeOrder = (rule, direction) => {
    const currentIndex = valueGenerators.findIndex(r => r.id === rule.id)
    if (direction === 'up' && currentIndex > 0) {
      const aboveRule = valueGenerators[currentIndex - 1]
      onUpdate(rule.id, { order_index: currentIndex - 1 })
      onUpdate(aboveRule.id, { order_index: currentIndex })
    } else if (direction === 'down' && currentIndex < valueGenerators.length - 1) {
      const belowRule = valueGenerators[currentIndex + 1]
      onUpdate(rule.id, { order_index: currentIndex + 1 })
      onUpdate(belowRule.id, { order_index: currentIndex })
    }
  }

  const handleDeleteRule = (id) => {
    if (window.confirm('이 규칙을 삭제하시겠습니까?')) {
      onDelete(id)
    }
  }

  const sortedGenerators = [...valueGenerators].sort((a, b) => a.order_index - b.order_index)

  if (loading) {
    return <div className="text-center py-8">로딩 중...</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-l-4 border-l-[#EF4444] bg-[#FEE2E2]">
          <CardBody>
            <p className="text-[#DC2626]">{error}</p>
          </CardBody>
        </Card>
      )}

      {/* Template Selector or Rule Creation Form */}
      {(showTemplateSelector || selectedTemplate) && (
        <Card>
          <CardBody>
            {showTemplateSelector ? (
              <>
                <h3 className="text-lg font-semibold text-[#1F2937] mb-4">
                  규칙 템플릿 선택
                </h3>
                <RuleTemplateSelector
                  templates={templates}
                  onSelect={handleSelectTemplate}
                />
              </>
            ) : selectedTemplate ? (
              <>
                <h3 className="text-lg font-semibold text-[#1F2937] mb-4">
                  {editingId ? '규칙 수정' : '새 규칙 생성'}: {selectedTemplate.name}
                </h3>

                <div className="space-y-4">
                  <FormInput
                    id="json_path"
                    name="json_path"
                    label="JSON 경로"
                    type="text"
                    value={ruleConfig.json_path || ''}
                    onChange={(e) => setRuleConfig({ ...ruleConfig, json_path: e.target.value })}
                    placeholder="예: dialogs[0].nodes[].label"
                    required
                  />

                  {/* Template-specific config fields */}
                  {selectedTemplate.rule_type === 'direct' && (
                    <FormInput
                      id="value"
                      name="value"
                      label="값"
                      type="textarea"
                      value={JSON.stringify(ruleConfig.value !== undefined ? ruleConfig.value : '')}
                      onChange={(e) => {
                        try {
                          const val = JSON.parse(e.target.value)
                          setRuleConfig({ ...ruleConfig, value: val })
                        } catch {
                          setRuleConfig({ ...ruleConfig, value: e.target.value })
                        }
                      }}
                      placeholder="정적 값 입력"
                      required
                    />
                  )}

                  {selectedTemplate.rule_type === 'template' && (
                    <FormInput
                      id="template"
                      name="template"
                      label="템플릿 문자열"
                      type="textarea"
                      value={ruleConfig.template || ''}
                      onChange={(e) => setRuleConfig({ ...ruleConfig, template: e.target.value })}
                      placeholder='예: "안녕 ${name}, 나이는 ${age}입니다"'
                      required
                    />
                  )}

                  {selectedTemplate.rule_type === 'function' && (
                    <div>
                      <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                        함수 코드
                      </label>
                      <textarea
                        className="w-full border border-[#E5E7EB] rounded-lg p-3 font-mono text-sm"
                        rows="6"
                        value={ruleConfig.function_code || ''}
                        onChange={(e) => setRuleConfig({ ...ruleConfig, function_code: e.target.value })}
                        placeholder="예: return responses['q1'] + responses['q2']"
                        required
                      />
                      <p className="text-xs text-[#6B7280] mt-2">
                        안전한 작업만 지원합니다 (require, import, eval 등은 차단됨)
                      </p>
                    </div>
                  )}

                  {selectedTemplate.rule_type === 'conditional' && (
                    <div className="space-y-3">
                      <FormInput
                        id="condition_field"
                        name="condition_field"
                        label="조건 필드"
                        type="text"
                        value={ruleConfig.condition?.field || ''}
                        onChange={(e) => setRuleConfig({
                          ...ruleConfig,
                          condition: { ...ruleConfig.condition, field: e.target.value }
                        })}
                        placeholder="예: responses['q1']"
                      />
                      <FormInput
                        id="condition_operator"
                        name="condition_operator"
                        label="연산자"
                        type="select"
                        value={ruleConfig.condition?.operator || 'equals'}
                        onChange={(e) => setRuleConfig({
                          ...ruleConfig,
                          condition: { ...ruleConfig.condition, operator: e.target.value }
                        })}
                        options={[
                          { value: 'equals', label: '같음 (=)' },
                          { value: 'contains', label: '포함 (contains)' },
                          { value: 'matches', label: '매치 (regex)' },
                        ]}
                      />
                      <FormInput
                        id="condition_value"
                        name="condition_value"
                        label="조건값"
                        type="text"
                        value={ruleConfig.condition?.value || ''}
                        onChange={(e) => setRuleConfig({
                          ...ruleConfig,
                          condition: { ...ruleConfig.condition, value: e.target.value }
                        })}
                      />
                    </div>
                  )}

                  {selectedTemplate.rule_type === 'array' && (
                    <FormInput
                      id="array_count"
                      name="array_count"
                      label="배열 원소 개수"
                      type="number"
                      value={ruleConfig.count || ''}
                      onChange={(e) => setRuleConfig({ ...ruleConfig, count: parseInt(e.target.value) || 0 })}
                      placeholder="예: 3"
                      required
                    />
                  )}

                  {selectedTemplate.rule_type === 'reference' && (
                    <FormInput
                      id="source_field"
                      name="source_field"
                      label="참조 필드 경로"
                      type="text"
                      value={ruleConfig.source_field || ''}
                      onChange={(e) => setRuleConfig({ ...ruleConfig, source_field: e.target.value })}
                      placeholder="예: dialogs[0].title"
                      required
                    />
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button type="button" variant="default" onClick={editingId ? handleUpdateRule : handleCreateRule}>
                      {editingId ? '수정' : '생성'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setSelectedTemplate(null)
                        setRuleConfig({})
                        setEditingId(null)
                      }}
                    >
                      취소
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>
      )}

      {!showTemplateSelector && !selectedTemplate && (
        <Button onClick={() => setShowTemplateSelector(true)}>
          + 규칙 생성
        </Button>
      )}

      {/* Table of existing rules */}
      {sortedGenerators.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-[#1F2937] mb-4">
              생성된 규칙 ({sortedGenerators.length}개)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E7EB]">
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      순서
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      JSON 경로
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      타입
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-[#6B7280]">
                      템플릿
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-[#6B7280]">
                      활성화
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-[#6B7280]">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGenerators.map((rule, idx) => {
                    const template = templates.find(t => t.id === rule.template_id)
                    return (
                      <tr key={rule.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                        <td className="py-3 px-4 text-[#1F2937]">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleChangeOrder(rule, 'up')}
                              disabled={idx === 0}
                            >
                              ↑
                            </Button>
                            <span className="w-6 text-center font-semibold">{idx + 1}</span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleChangeOrder(rule, 'down')}
                              disabled={idx === sortedGenerators.length - 1}
                            >
                              ↓
                            </Button>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <code className="bg-[#F3F4F6] px-2 py-1 rounded text-xs text-[#1F2937]">
                            {rule.json_path}
                          </code>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block bg-[#DBEAFE] text-[#1E40AF] px-2 py-1 rounded text-xs font-medium">
                            {rule.rule_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-[#6B7280]">
                          {template?.name || 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => handleToggleEnabled(rule)}
                            className="h-4 w-4 accent-primary-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleEditRule(rule)}
                          >
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDeleteRule(rule.id)}
                          >
                            삭제
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {sortedGenerators.length === 0 && !showTemplateSelector && !selectedTemplate && (
        <Card className="bg-[#FFFBEB] border-l-4 border-l-[#FBBF24]">
          <CardBody>
            <p className="text-[#92400E]">
              아직 생성된 규칙이 없습니다. "+ 규칙 생성" 버튼으로 시작하세요.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export default RuleValueGeneratorManager

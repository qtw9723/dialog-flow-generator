import { useState, useEffect } from 'react'
import { downloadJson, downloadText, downloadCsv, downloadBlob } from '../../lib/downloadFile.js'
import { Card, CardBody } from '../common/Card'
import { Button } from '../common/Button'
import { RuleTemplateSelector } from './RuleTemplateSelector'
import { RuleFieldDefinitionManager } from './RuleFieldDefinitionManager'
import { RuleValueGeneratorManager } from './RuleValueGeneratorManager'
import { useReferences } from '../../context/ReferencesContext'
import { useRuleFieldDefinitions } from '../../context/RuleFieldDefinitionsContext'
import { useRuleValueGenerators } from '../../context/RuleValueGeneratorsContext'
import { useRuleTemplates } from '../../context/RuleTemplatesContext'
import { useApi } from '../../hooks/useApi'
import { API_ENDPOINTS } from '../../lib/constants'

export const RulesManagementPage = () => {
  const [activeTab, setActiveTab] = useState('templates')
  const [selectedReferenceId, setSelectedReferenceId] = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const [bulkError, setBulkError] = useState('')

  // Context hooks
  const { masterReference, references } = useReferences()
  const {
    fieldDefinitions,
    currentReferenceId: fieldDefRefId,
    setCurrentReferenceId: setFieldDefRefId,
    loading: fieldDefLoading,
    error: fieldDefError,
    createDefinition,
    updateDefinition,
    deleteDefinition,
  } = useRuleFieldDefinitions()

  const {
    valueGenerators,
    currentReferenceId: valueGenRefId,
    setCurrentReferenceId: setValueGenRefId,
    loading: valueGenLoading,
    error: valueGenError,
    createGenerator,
    updateGenerator,
    deleteGenerator,
  } = useRuleValueGenerators()

  const {
    templates,
    loading: templateLoading,
  } = useRuleTemplates()

  const { request } = useApi()

  // Auto-select master reference
  useEffect(() => {
    if (masterReference && !selectedReferenceId) {
      setSelectedReferenceId(masterReference.id)
    }
  }, [masterReference, selectedReferenceId])

  // Sync selected reference with contexts
  useEffect(() => {
    if (selectedReferenceId) {
      setFieldDefRefId(selectedReferenceId)
      setValueGenRefId(selectedReferenceId)
    }
  }, [selectedReferenceId, setFieldDefRefId, setValueGenRefId])

  // Get current reference details
  const currentReference = references.find(ref => ref.id === selectedReferenceId)

  // Get status of field definitions and value generators
  const getStatusBadge = (status) => {
    if (!status) return null
    const statusMap = {
      pending: { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', label: '진행 중' },
      completed: { bg: 'bg-[#DCFCE7]', text: 'text-[#166534]', label: '완료' },
    }
    const config = statusMap[status] || {}
    return (
      <span className={`inline-block ${config.bg} ${config.text} px-2 py-1 rounded text-xs font-medium`}>
        {config.label}
      </span>
    )
  }

  // Bulk Actions

  const handleExtractFromMaster = async () => {
    if (!masterReference) {
      setBulkError('Master Reference가 없습니다.')
      return
    }

    setBulkLoading(true)
    setBulkError('')
    setBulkMessage('')

    try {
      const response = await request(API_ENDPOINTS.LEARN_RULES, {
        method: 'POST',
        body: { reference_id: masterReference.id }
      })

      setBulkMessage('Master Reference에서 규칙을 성공적으로 추출했습니다.')
      // Refresh current reference if it's the master
      if (selectedReferenceId === masterReference.id) {
        setFieldDefRefId(masterReference.id)
        setValueGenRefId(masterReference.id)
      }
    } catch (err) {
      setBulkError(`추출 실패: ${err.message}`)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleResetAll = async () => {
    if (!currentReference) {
      setBulkError('선택된 Reference가 없습니다.')
      return
    }

    if (!window.confirm(`"${currentReference.name}"의 모든 규칙을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return
    }

    setBulkLoading(true)
    setBulkError('')
    setBulkMessage('')

    try {
      // Delete all field definitions and value generators for this reference
      await Promise.all([
        ...fieldDefinitions.map(def => deleteDefinition(def.id)),
        ...valueGenerators.map(gen => deleteGenerator(gen.id)),
      ])

      // Reset status to pending
      if (currentReference.field_definitions_status || currentReference.value_generators_status) {
        await request(`${API_ENDPOINTS.ADMIN_REFERENCES}?id=${currentReference.id}`, {
          method: 'PATCH',
          body: {
            field_definitions_status: 'pending',
            value_generators_status: 'pending',
          }
        })
      }

      setBulkMessage('모든 규칙이 초기화되었습니다.')
      setFieldDefRefId(currentReference.id)
      setValueGenRefId(currentReference.id)
    } catch (err) {
      setBulkError(`초기화 실패: ${err.message}`)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleExport = () => {
    if (!currentReference) {
      setBulkError('선택된 Reference가 없습니다.')
      return
    }

    const exportData = {
      reference: {
        id: currentReference.id,
        name: currentReference.name,
        is_master: currentReference.is_master,
      },
      field_definitions: fieldDefinitions,
      value_generators: valueGenerators,
      templates: templates,
      exported_at: new Date().toISOString(),
    }

    downloadJson(`rules-${currentReference.name}-${Date.now()}.json`, exportData)

    setBulkMessage('규칙 데이터를 내보냈습니다.')
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!currentReference) {
      setBulkError('선택된 Reference가 없습니다.')
      return
    }

    setBulkLoading(true)
    setBulkError('')
    setBulkMessage('')

    try {
      const fileContent = await file.text()
      const importData = JSON.parse(fileContent)

      // Validate structure
      if (!importData.field_definitions || !importData.value_generators) {
        throw new Error('Invalid import file format')
      }

      // Clear existing data
      await Promise.all([
        ...fieldDefinitions.map(def => deleteDefinition(def.id)),
        ...valueGenerators.map(gen => deleteGenerator(gen.id)),
      ])

      // Import field definitions
      for (const def of importData.field_definitions) {
        await createDefinition({
          reference_id: currentReference.id,
          json_path: def.json_path,
          field_name: def.field_name,
          field_type: def.field_type,
          is_required: def.is_required,
          description: def.description,
          enum_values: def.enum_values,
          pattern: def.pattern,
          min_value: def.min_value,
          max_value: def.max_value,
        })
      }

      // Import value generators
      for (const gen of importData.value_generators) {
        await createGenerator({
          reference_id: currentReference.id,
          template_id: gen.template_id,
          json_path: gen.json_path,
          rule_type: gen.rule_type,
          rule_config: gen.rule_config,
          order_index: gen.order_index,
          enabled: gen.enabled,
        })
      }

      setBulkMessage('규칙 데이터를 성공적으로 가져왔습니다.')
      setFieldDefRefId(currentReference.id)
      setValueGenRefId(currentReference.id)
    } catch (err) {
      setBulkError(`가져오기 실패: ${err.message}`)
    } finally {
      setBulkLoading(false)
      e.target.value = ''
    }
  }

  // Tab content components
  const renderTabContent = () => {
    switch (activeTab) {
      case 'templates':
        return (
          <div className="space-y-4">
            <Card>
              <CardBody>
                <h3 className="text-lg font-semibold text-[#1F2937] mb-4">
                  규칙 템플릿 관리
                </h3>
                <p className="text-sm text-[#6B7280] mb-6">
                  규칙 템플릿은 전역 관리 대상입니다. 모든 Reference에서 동일하게 사용됩니다.
                </p>
                <RuleTemplateSelector
                  templates={templates}
                  loading={templateLoading}
                />
              </CardBody>
            </Card>
          </div>
        )

      case 'field_definitions':
        return (
          <div className="space-y-4">
            {currentReference && (
              <Card className="border-l-4 border-l-primary-500">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#6B7280]">필드 정의 상태</p>
                      <p className="text-lg font-semibold text-[#1F2937]">
                        {currentReference.name}
                      </p>
                    </div>
                    {currentReference.field_definitions_status && (
                      <div>
                        {getStatusBadge(currentReference.field_definitions_status)}
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            )}
            <RuleFieldDefinitionManager
              referenceId={selectedReferenceId}
              fieldDefinitions={fieldDefinitions}
              onAdd={createDefinition}
              onUpdate={updateDefinition}
              onDelete={deleteDefinition}
              loading={fieldDefLoading}
              error={fieldDefError}
            />
          </div>
        )

      case 'value_generators':
        return (
          <div className="space-y-4">
            {currentReference && (
              <Card className="border-l-4 border-l-primary-500">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#6B7280]">값 생성기 상태</p>
                      <p className="text-lg font-semibold text-[#1F2937]">
                        {currentReference.name}
                      </p>
                    </div>
                    {currentReference.value_generators_status && (
                      <div>
                        {getStatusBadge(currentReference.value_generators_status)}
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            )}
            <RuleValueGeneratorManager
              referenceId={selectedReferenceId}
              templates={templates}
              valueGenerators={valueGenerators}
              onAdd={createGenerator}
              onUpdate={updateGenerator}
              onDelete={deleteGenerator}
              loading={valueGenLoading}
              error={valueGenError}
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-[#1F2937]">
          규칙 관리
        </h1>
        <p className="text-[#6B7280]">
          규칙 템플릿, 필드 정의, 값 생성기를 통합 관리합니다.
        </p>
      </div>

      {/* Bulk Messages */}
      {bulkMessage && (
        <Card className="border-l-4 border-l-[#059669] bg-[#DCFCE7]">
          <CardBody>
            <p className="text-[#166534] font-semibold">{bulkMessage}</p>
          </CardBody>
        </Card>
      )}

      {bulkError && (
        <Card className="border-l-4 border-l-[#EF4444] bg-[#FEE2E2]">
          <CardBody>
            <p className="text-[#DC2626] font-semibold">오류 발생</p>
            <p className="text-[#DC2626] text-sm mt-1">{bulkError}</p>
          </CardBody>
        </Card>
      )}

      {/* Reference Selector */}
      <Card>
        <CardBody>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Reference 선택
              </label>
              <select
                value={selectedReferenceId || ''}
                onChange={(e) => setSelectedReferenceId(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-lg p-2 text-sm text-[#1F2937]"
              >
                <option value="">Select a reference...</option>
                {references.map(ref => (
                  <option key={ref.id} value={ref.id}>
                    {ref.name}
                    {ref.is_master ? ' (Master)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {currentReference && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-[#E5E7EB]">
                <div>
                  <p className="text-xs text-[#6B7280]">ID</p>
                  <p className="text-sm font-mono text-[#1F2937]">
                    {currentReference.id.slice(0, 8)}...
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">Master</p>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    {currentReference.is_master ? '✓' : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">필드 정의</p>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    {fieldDefinitions.length}개
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">값 생성기</p>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    {valueGenerators.length}개
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Tab Navigation */}
      <div className="flex gap-4 border-b border-[#E5E7EB]">
        <button
          onClick={() => setActiveTab('templates')}
          className={`pb-4 px-4 font-semibold text-sm transition ${
            activeTab === 'templates'
              ? 'border-b-2 border-b-primary-500 text-primary-500'
              : 'text-[#6B7280] hover:text-[#1F2937]'
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setActiveTab('field_definitions')}
          className={`pb-4 px-4 font-semibold text-sm transition ${
            activeTab === 'field_definitions'
              ? 'border-b-2 border-b-primary-500 text-primary-500'
              : 'text-[#6B7280] hover:text-[#1F2937]'
          }`}
        >
          Field Definitions
        </button>
        <button
          onClick={() => setActiveTab('value_generators')}
          className={`pb-4 px-4 font-semibold text-sm transition ${
            activeTab === 'value_generators'
              ? 'border-b-2 border-b-primary-500 text-primary-500'
              : 'text-[#6B7280] hover:text-[#1F2937]'
          }`}
        >
          Value Generators
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {renderTabContent()}
      </div>

      {/* Bulk Actions */}
      {(activeTab === 'field_definitions' || activeTab === 'value_generators') && currentReference && (
        <Card className="border-l-4 border-l-[#F59E0B] bg-[#FEF3C7]">
          <CardBody>
            <h3 className="text-lg font-semibold text-[#92400E] mb-4">
              벌크 작업
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={handleExtractFromMaster}
                disabled={bulkLoading || !masterReference}
                variant="default"
                className="w-full"
              >
                {bulkLoading ? '처리 중...' : 'Extract from Master'}
              </Button>

              <Button
                onClick={handleResetAll}
                disabled={bulkLoading}
                variant="danger"
                className="w-full"
              >
                {bulkLoading ? '처리 중...' : 'Reset All'}
              </Button>

              <Button
                onClick={handleExport}
                disabled={bulkLoading}
                variant="secondary"
                className="w-full"
              >
                Export Data
              </Button>

              <label className="relative">
                <Button
                  as="span"
                  disabled={bulkLoading}
                  variant="secondary"
                  className="w-full cursor-pointer"
                >
                  Import Data
                </Button>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  disabled={bulkLoading}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export default RulesManagementPage

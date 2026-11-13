import { Modal } from './common/Modal'
import { Button } from './common/Button'
import { useState } from 'react'

export const LearningDataModal = ({ isOpen, onClose, reference }) => {
  const [expandedSections, setExpandedSections] = useState({
    basicRules: true,
    fieldDefinitions: false,
    valueGenerators: false,
    identifiedFeatures: false,
    generationTiers: false,
  })

  if (!reference) {
    return null
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const renderJsonViewer = (data, compact = false) => {
    if (!data) {
      return <p className="text-sm text-[#9CA3AF]">데이터 없음</p>
    }

    const jsonString = JSON.stringify(data, null, compact ? 0 : 2)
    return (
      <pre className="bg-[#1F2937] text-[#E5E7EB] p-3 rounded overflow-x-auto text-xs max-h-96 overflow-y-auto font-mono">
        {jsonString}
      </pre>
    )
  }

  const DataSection = ({ title, section, data, dataSize }) => (
    <div className="border border-[#E5E7EB] rounded mb-3">
      <button
        onClick={() => toggleSection(section)}
        className="w-full flex items-center justify-between p-3 bg-[#F9FAFB] hover:bg-[#F3F4F6] transition"
      >
        <div className="text-left">
          <h4 className="font-semibold text-[#1F2937]">{title}</h4>
          <p className="text-xs text-[#6B7280]">
            {dataSize ? `${dataSize}개 항목` : '데이터 확인'}
          </p>
        </div>
        <span className="text-[#6B7280]">
          {expandedSections[section] ? '▼' : '▶'}
        </span>
      </button>
      {expandedSections[section] && (
        <div className="p-3 border-t border-[#E5E7EB] bg-[#FAFBFC]">
          {data ? (
            renderJsonViewer(data)
          ) : (
            <p className="text-sm text-[#9CA3AF]">데이터 없음</p>
          )}
        </div>
      )}
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${reference.name} - 학습 데이터`}
      size="xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Basic Rules (Tier 1) */}
        <DataSection
          title="📊 기본 규칙 (Tier 1)"
          section="basicRules"
          data={reference.basic_rules}
          dataSize={
            reference.basic_rules?.schema?.required_fields?.length ||
            Object.keys(reference.basic_rules?.type_definitions || {}).length
          }
        />

        {/* Field Definitions (Tier 2) */}
        <DataSection
          title="📋 필드 정의 (Tier 2)"
          section="fieldDefinitions"
          data={reference.field_definitions || []}
          dataSize={
            reference.field_definitions
              ? Array.isArray(reference.field_definitions)
                ? reference.field_definitions.length
                : Object.keys(reference.field_definitions).length
              : 0
          }
        />

        {/* Value Generators (Tier 3) */}
        <DataSection
          title="⚙️ 값 생성기 (Tier 3)"
          section="valueGenerators"
          data={reference.rule_value_generators || []}
          dataSize={
            reference.rule_value_generators
              ? Array.isArray(reference.rule_value_generators)
                ? reference.rule_value_generators.length
                : Object.keys(reference.rule_value_generators).length
              : 0
          }
        />

        {/* Identified Features */}
        {reference.identified_features && reference.identified_features.length > 0 && (
          <DataSection
            title="✨ 식별된 기능"
            section="identifiedFeatures"
            data={reference.identified_features}
            dataSize={reference.identified_features.length}
          />
        )}

        {/* Generation Tiers Metadata */}
        {reference.generation_tiers && (
          <DataSection
            title="📈 생성 메타데이터"
            section="generationTiers"
            data={reference.generation_tiers}
          />
        )}

        {/* Learning Status */}
        <div className="border border-[#E5E7EB] rounded p-3 bg-[#F9FAFB]">
          <h4 className="font-semibold text-[#1F2937] mb-2">📌 학습 상태</h4>
          <div className="space-y-1 text-sm text-[#6B7280]">
            <p>
              기본 규칙: <span className={reference.basic_rules_status === 'completed' ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                {reference.basic_rules_status || 'pending'}
              </span>
            </p>
            <p>
              필드 정의: <span className={reference.field_definitions_status === 'completed' ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                {reference.field_definitions_status || 'pending'}
              </span>
            </p>
            <p>
              값 생성기: <span className={reference.value_generators_status === 'completed' ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                {reference.value_generators_status || 'pending'}
              </span>
            </p>
            <p>
              통합 학습: <span className={reference.unified_template_status === 'completed' ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                {reference.unified_template_status || 'pending'}
              </span>
            </p>
          </div>
        </div>

        {/* Copy Button */}
        <Button
          variant="secondary"
          size="full"
          onClick={() => {
            const allData = {
              name: reference.name,
              basicRules: reference.basic_rules,
              fieldDefinitions: reference.field_definitions,
              valueGenerators: reference.rule_value_generators,
              identifiedFeatures: reference.identified_features,
              generationTiers: reference.generation_tiers,
              learningStatus: {
                basicRulesStatus: reference.basic_rules_status,
                fieldDefinitionsStatus: reference.field_definitions_status,
                valueGeneratorsStatus: reference.value_generators_status,
                unifiedTemplateStatus: reference.unified_template_status,
              }
            }
            navigator.clipboard.writeText(JSON.stringify(allData, null, 2))
            alert('모든 학습 데이터가 클립보드에 복사되었습니다')
          }}
        >
          💾 모든 데이터 복사
        </Button>
      </div>
    </Modal>
  )
}

export default LearningDataModal

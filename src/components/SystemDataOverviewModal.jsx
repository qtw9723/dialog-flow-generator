import { Modal } from './common/Modal'
import { Button } from './common/Button'
import { useState } from 'react'
import { formatKST } from '../utils/datetime'

export const SystemDataOverviewModal = ({ isOpen, onClose, references, masterReference }) => {
  const [expandedSections, setExpandedSections] = useState({
    systemMetadata: true,
    masterSchema: true,
    learningData: false,
    llmPrompt: false,
  })

  if (!masterReference || !references) {
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

  // Generate LLM-friendly prompt from all data
  const generateLLMPrompt = () => {
    const childReferences = references.filter(r => !r.is_master)

    const prompt = `# 시스템 데이터 개요

## 마스터 스키마
${JSON.stringify(masterReference.json_data, null, 2)}

## 등록된 변형 (${childReferences.length}개)
${childReferences.map((ref, i) => `${i + 1}. ${ref.name}
   시나리오: ${ref.scenario_description || 'N/A'}
   식별된 기능: ${ref.identified_features?.map(f => f.name).join(', ') || 'N/A'}`).join('\n')}

## 기본 규칙 (Tier 1)
${masterReference.basic_rules ? JSON.stringify(masterReference.basic_rules, null, 2) : 'N/A'}

## 필드 정의 (Tier 2)
${masterReference.field_definitions ? JSON.stringify(masterReference.field_definitions, null, 2) : 'N/A'}

## 값 생성 규칙 (Tier 3)
${masterReference.rule_value_generators ? JSON.stringify(masterReference.rule_value_generators, null, 2) : 'N/A'}`

    return prompt
  }

  const DataSection = ({ title, section, content, size }) => (
    <div className="border border-[#E5E7EB] rounded mb-3">
      <button
        onClick={() => toggleSection(section)}
        className="w-full flex items-center justify-between p-3 bg-[#F9FAFB] hover:bg-[#F3F4F6] transition"
      >
        <div className="text-left">
          <h4 className="font-semibold text-[#1F2937]">{title}</h4>
          {size && <p className="text-xs text-[#6B7280]">{size}</p>}
        </div>
        <span className="text-[#6B7280]">
          {expandedSections[section] ? '▼' : '▶'}
        </span>
      </button>
      {expandedSections[section] && (
        <div className="p-3 border-t border-[#E5E7EB] bg-[#FAFBFC]">
          {content}
        </div>
      )}
    </div>
  )

  const childReferences = references.filter(r => !r.is_master)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📊 전체 시스템 데이터 개요"
      size="2xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* System Metadata */}
        <DataSection
          title="📌 시스템 메타데이터"
          section="systemMetadata"
          size={`마스터: ${masterReference.name} | 변형: ${childReferences.length}개`}
          content={
            <div className="text-sm space-y-2 text-[#6B7280]">
              <p><strong>마스터 레퍼런스:</strong> {masterReference.name}</p>
              <p><strong>등록된 변형:</strong> {childReferences.length}개</p>
              <p><strong>학습 상태:</strong> {masterReference.basic_rules_status === 'completed' ? '✓ 완료' : '⚠️ 미완료'}</p>
              <p><strong>생성 시간:</strong> {formatKST(masterReference.created_at)}</p>
            </div>
          }
        />

        {/* Master Schema */}
        <DataSection
          title="📋 마스터 스키마"
          section="masterSchema"
          size="Master JSON 구조"
          content={renderJsonViewer(masterReference.json_data)}
        />

        {/* Learning Data Summary */}
        <DataSection
          title="🎓 학습 데이터 요약"
          section="learningData"
          size={`Basic Rules | Field Definitions | Value Generators`}
          content={
            <div className="space-y-3">
              <div>
                <h5 className="font-semibold text-[#1F2937] mb-2">기본 규칙 (Tier 1)</h5>
                {masterReference.basic_rules ? (
                  <div className="text-xs text-[#6B7280]">
                    <p>• 필수 필드: {masterReference.basic_rules?.schema?.required_fields?.length || 0}개</p>
                    <p>• 타입 정의: {Object.keys(masterReference.basic_rules?.type_definitions || {}).length}개</p>
                  </div>
                ) : (
                  <p className="text-xs text-[#9CA3AF]">데이터 없음</p>
                )}
              </div>
              <div>
                <h5 className="font-semibold text-[#1F2937] mb-2">필드 정의 (Tier 2)</h5>
                <p className="text-xs text-[#9CA3AF]">
                  {Array.isArray(masterReference.field_definitions)
                    ? `${masterReference.field_definitions.length}개 필드`
                    : Object.keys(masterReference.field_definitions || {}).length + '개 필드'}
                </p>
              </div>
              <div>
                <h5 className="font-semibold text-[#1F2937] mb-2">값 생성 규칙 (Tier 3)</h5>
                <p className="text-xs text-[#9CA3AF]">
                  {Array.isArray(masterReference.rule_value_generators)
                    ? `${masterReference.rule_value_generators.length}개 규칙`
                    : Object.keys(masterReference.rule_value_generators || {}).length + '개 규칙'}
                </p>
              </div>
            </div>
          }
        />

        {/* LLM-Friendly Prompt */}
        <DataSection
          title="🤖 LLM용 통합 프롬프트"
          section="llmPrompt"
          size="LLM이 이해하기 쉬운 형식"
          content={
            <div className="bg-[#1F2937] text-[#E5E7EB] p-3 rounded overflow-x-auto text-xs max-h-96 overflow-y-auto font-mono whitespace-pre-wrap break-words">
              {generateLLMPrompt()}
            </div>
          }
        />

        {/* Copy Buttons */}
        <div className="space-y-2 pt-4 border-t border-[#E5E7EB]">
          <Button
            variant="secondary"
            size="full"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify({
                masterReference,
                childReferencesCount: childReferences.length,
                learningStatus: {
                  basicRulesStatus: masterReference.basic_rules_status,
                  fieldDefinitionsStatus: masterReference.field_definitions_status,
                  valueGeneratorsStatus: masterReference.value_generators_status,
                }
              }, null, 2))
              alert('시스템 데이터가 클립보드에 복사되었습니다')
            }}
          >
            💾 시스템 데이터 복사
          </Button>
          <Button
            variant="secondary"
            size="full"
            onClick={() => {
              navigator.clipboard.writeText(generateLLMPrompt())
              alert('LLM 프롬프트가 클립보드에 복사되었습니다')
            }}
          >
            🤖 LLM 프롬프트 복사
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default SystemDataOverviewModal

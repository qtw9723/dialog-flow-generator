import { useState } from 'react'
import { downloadJson, downloadText, downloadCsv, downloadBlob } from '../lib/downloadFile.js'
import { useReferences } from '../context/ReferencesContext'
import { AdminLayout } from './AdminLayout'
import { Card, CardBody } from './common/Card'
import { Button } from './common/Button'
import { FormInput } from './common/FormInput'
import LearningDataModal from './LearningDataModal'
import SystemDataOverviewModal from './SystemDataOverviewModal'
import { formatKST } from '../utils/datetime'

export default function ReferenceManager() {
  const { references, masterReference, loading, error: fetchError, uploadReference, updateReference, deleteReference, refetch, triggerUnifiedLearning } = useReferences()

  const [show, setShow] = useState(false)
  const [editId, setEditId] = useState(null)
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [scenarioDescription, setScenarioDescription] = useState('')
  const [error, setError] = useState('')
  const [unifiedLearning, setUnifiedLearning] = useState(false)
  const [setAsMaster, setSetAsMaster] = useState(false)
  const [showLearningData, setShowLearningData] = useState(false)
  const [selectedReference, setSelectedReference] = useState(null)
  const [showSystemOverview, setShowSystemOverview] = useState(false)
  const [savedJsonInfo, setSavedJsonInfo] = useState(null)

  const handleUnifiedLearning = async () => {
    setUnifiedLearning(true)
    setError('')
    try {
      console.log('[ReferenceManager] Starting unified learning...')
      await triggerUnifiedLearning()
      console.log('[ReferenceManager] Unified learning completed successfully')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[ReferenceManager] Unified learning failed:', errorMsg)
      setError('통합 학습 실패: ' + errorMsg)
    } finally {
      setUnifiedLearning(false)
    }
  }

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) {
      setFile(null)
      setError('')
      return
    }

    // Validate file type
    if (!selectedFile.name.endsWith('.json')) {
      setError('JSON 파일만 업로드 가능합니다')
      setFile(null)
      return
    }

    // Validate file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024
    if (selectedFile.size > MAX_SIZE) {
      setError('파일 크기는 5MB 이하여야 합니다')
      setFile(null)
      return
    }

    setFile(selectedFile)
    // 새 파일을 선택했으므로 저장된 파일 정보 업데이트
    setSavedJsonInfo({
      name: selectedFile.name.replace('.json', ''),
      size: selectedFile.size
    })
    setError('')
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    setError('')
    if (!name) {
      setError('이름은 필수입니다')
      return
    }
    if (!file && !editId) {
      setError('파일이 필수입니다')
      return
    }

    try {
      if (editId) {
        // Update mode
        const updates = { name, scenario_description: scenarioDescription }
        console.log('[ReferenceManager] handleUpload - preparing update:', {
          editId,
          name,
          scenarioDescription,
          scenarioDescriptionEmpty: !scenarioDescription || scenarioDescription.trim().length === 0,
          updates
        })
        let jsonChanged = false
        if (file) {
          const text = await file.text()
          const json = JSON.parse(text)
          updates.json_data = json
          jsonChanged = true
        }
        // Allow setting as master during edit
        if (setAsMaster && !masterReference) {
          updates.is_master = true
        }
        console.log('[ReferenceManager] About to call updateReference with:', updates)
        await updateReference(editId, updates)

        // Log when JSON was changed
        if (jsonChanged) {
          console.log('[ReferenceManager] Reference JSON updated - learning status reset')
        }
      } else {
        // Upload mode
        const text = await file.text()
        const json = JSON.parse(text)
        await uploadReference(name, json, setAsMaster)
      }

      setFile(null)
      setName('')
      setScenarioDescription('')
      setSetAsMaster(false)
      setEditId(null)
      setShow(false)

      // Refetch to ensure masterReference is updated
      await refetch()
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('유효한 JSON 파일이 아닙니다')
      } else {
        setError((editId ? '수정' : '파일 읽기') + ' 실패: ' + err.message)
      }
    }
  }

  const handleDownload = (ref) => downloadJson(`${ref.name}.json`, ref.json_data)

  const handleEdit = (ref) => {
    const scenarioDescValue = ref.scenario_description || ''

    // 저장된 JSON 정보 설정
    let jsonInfo = null
    if (ref.json_data) {
      const jsonName = ref.json_data.name || '저장된 JSON'
      jsonInfo = {
        name: jsonName,
        size: JSON.stringify(ref.json_data).length
      }
    }

    console.log('[ReferenceManager] Edit reference:', {
      id: ref.id,
      name: ref.name,
      scenario_description: ref.scenario_description,
      scenarioDescValue,
      hasJsonData: !!ref.json_data,
      jsonInfo,
      all_keys: Object.keys(ref)
    })
    setEditId(ref.id)
    setName(ref.name)
    setScenarioDescription(scenarioDescValue)
    setSavedJsonInfo(jsonInfo)
    console.log('[ReferenceManager] After setState call - about to show form')
    setFile(null)
    setError('')
    setShow(true)
  }

  const handleCancel = () => {
    setShow(false)
    setFile(null)
    setName('')
    setScenarioDescription('')
    setError('')
    setSetAsMaster(false)
    setEditId(null)
    setSavedJsonInfo(null)
  }

  return (
    <AdminLayout title="참고자료 관리">
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

      {/* Master Reference Info */}
      {!show && masterReference && (
        <Card className="mb-4 bg-gradient-to-r from-[#EFF6FF] to-[#F3F4F6] border-2 border-primary-500">
          <CardBody>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-semibold text-lg text-[#1F2937]">{masterReference.name}</p>
                  <span className="inline-block px-3 py-1 bg-primary-500 text-white text-xs font-semibold rounded">
                    마스터
                  </span>
                </div>

                <p className="text-sm text-[#6B7280] mb-2">
                  통합 학습:{' '}
                  {masterReference.unified_template_status === 'completed'
                    ? '✓ 완료'
                    : '⚠️ 미완료'}
                </p>

                <p className="text-sm text-[#6B7280]">
                  {formatKST(masterReference.created_at)}
                </p>
              </div>

              <div className="flex gap-2 ml-4">
                <Button
                  size="sm"
                  onClick={() => handleDownload(masterReference)}
                >
                  다운로드
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleEdit(masterReference)}
                >
                  수정
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSelectedReference(masterReference)
                    setShowLearningData(true)
                  }}
                >
                  📊 학습 데이터
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowSystemOverview(true)}
                >
                  🌐 시스템 개요
                </Button>
                <Button
                  onClick={handleUnifiedLearning}
                  disabled={unifiedLearning}
                  className="flex-shrink-0"
                >
                  {unifiedLearning ? '학습 중...' : '통합 학습'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm('이 레퍼런스를 삭제하시겠습니까?'))
                      deleteReference(masterReference.id)
                  }}
                >
                  삭제
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {!show && !masterReference && (
        <Card className="mb-4 bg-[#FEF3C7] border border-[#FCD34D]">
          <CardBody className="py-3">
            <p className="text-sm text-[#92400E]">
              ℹ️ 마스터를 먼저 등록하고 통합 학습을 실행하세요. 모든 레퍼런스의 생성에 필요합니다.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Upload Button */}
      {!loading && !fetchError && !show && (
        <Button onClick={() => setShow(true)}>
          + 레퍼런스 업로드
        </Button>
      )}

      {/* Upload/Edit Form Card */}
      {show && (
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold mb-4 text-[#1F2937]">
              {editId ? '레퍼런스 수정' : '레퍼런스 업로드'}
            </h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <FormInput
                id="ref-name"
                name="ref-name"
                label="레퍼런스 이름"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="레퍼런스 이름을 입력해주세요"
                required
              />

              <FormInput
                id="json-file"
                name="json_file"
                type="file"
                label={editId ? 'JSON 파일 (선택사항)' : 'JSON 파일'}
                onChange={handleFileSelect}
                required={!editId}
              />
              {file && (
                <p className="text-sm text-[#10B981] -mt-2 mb-4">
                  ✓ 새 파일 선택됨: {file.name}
                </p>
              )}
              {!file && savedJsonInfo && (
                <p className="text-sm text-primary-500 -mt-2 mb-4">
                  ✓ 저장됨: {savedJsonInfo.name} ({(savedJsonInfo.size / 1024).toFixed(1)}KB)
                </p>
              )}
              {!file && !savedJsonInfo && editId && (
                <p className="text-sm text-[#9CA3AF] -mt-2 mb-4">
                  저장된 JSON 파일이 없습니다. 새 파일을 선택해주세요.
                </p>
              )}

              <FormInput
                id="scenario-description"
                name="scenario_description"
                type="textarea"
                label="시나리오 설명 (선택사항)"
                placeholder="예: 사용자 입력받고 → 변수 저장 → API 호출 후 → 결과로 발화"
                value={scenarioDescription}
                onChange={(e) => {
                  console.log('[ReferenceManager] scenario_description onChange fired:', {
                    currentValue: scenarioDescription,
                    newValue: e.target.value,
                    eventType: e.type
                  })
                  setScenarioDescription(e.target.value)
                }}
                rows={4}
              />

              {!masterReference && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="set-master"
                    checked={setAsMaster}
                    onChange={(e) => setSetAsMaster(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="set-master" className="text-sm text-[#1F2937]">
                    {editId ? '이 레퍼런스를 마스터 스키마로 설정' : '이 JSON을 마스터 스키마로 설정'}
                  </label>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button type="submit">
                  {editId ? '수정 완료' : '업로드'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancel}>
                  취소
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* References List */}
      {loading ? (
        <div className="text-center py-12 text-[#6B7280]">로딩 중...</div>
      ) : (
        <div className="space-y-3">
          {references.filter(ref => !ref.is_master).map((ref) => (
            <Card
              key={ref.id}
              className={editId === ref.id ? 'ring-2 ring-primary-500 bg-[#F0F9FF]' : ''}
            >
              <CardBody>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-semibold text-lg text-[#1F2937]">{ref.name}</p>
                      {ref.is_master && (
                        <span className="inline-block px-2 py-1 bg-[#DBEAFE] text-primary-500 text-xs font-semibold rounded">
                          마스터 스키마
                        </span>
                      )}
                    </div>

                    {!ref.is_master && ref.schema_validation_status && (
                      <p className="text-sm text-[#6B7280]">
                        검증 상태: {ref.schema_validation_status === 'valid' ? '✓ 유효' : '⚠️ 검증 필요'}
                      </p>
                    )}

                    {ref.scenario_description && (
                      <p className="text-sm text-[#6B7280] mt-1">
                        시나리오: {ref.scenario_description.substring(0, 80)}{ref.scenario_description.length > 80 ? '...' : ''}
                      </p>
                    )}

                    {ref.identified_features && ref.identified_features.length > 0 && (
                      <div className="p-2 bg-blue-50 rounded border border-blue-200 mt-2">
                        <p className="text-xs font-semibold text-blue-900 mb-1">식별된 기능:</p>
                        <ul className="space-y-0.5">
                          {ref.identified_features.map((feature, idx) => (
                            <li key={idx} className="text-xs text-blue-800">
                              • {feature.name}: {feature.purpose}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="text-sm text-[#6B7280] mt-1">
                      {formatKST(ref.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" onClick={() => handleDownload(ref)}>
                      다운로드
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleEdit(ref)}
                    >
                      수정
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (window.confirm('이 레퍼런스를 삭제하시겠습니까?'))
                          deleteReference(ref.id)
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Learning Data Modal */}
      <LearningDataModal
        isOpen={showLearningData}
        onClose={() => {
          setShowLearningData(false)
          setSelectedReference(null)
        }}
        reference={selectedReference}
      />

      {/* System Data Overview Modal */}
      <SystemDataOverviewModal
        isOpen={showSystemOverview}
        onClose={() => setShowSystemOverview(false)}
        references={references}
        masterReference={masterReference}
      />
    </AdminLayout>
  )
}

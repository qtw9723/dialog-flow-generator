import { useState } from 'react'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import FlowCanvas from '../flow/FlowCanvas'

export const ResultDetailModal = ({
  isOpen,
  onClose,
  result,
}) => {
  const [view, setView] = useState('json') // 'json' | 'diagram'

  if (!result) {
    return null
  }

  const generatedData = result.generated_json || result.data || {}
  const botName = (generatedData && generatedData.name) ? generatedData.name : 'bot'
  // 시각화 가능한 대화 플로우(dialogs/main)가 있을 때만 다이어그램 토글 노출
  const hasFlow = Array.isArray(generatedData?.dialogs) && generatedData.dialogs.some((d) => d?.id === 'main')

  const handleCopy = () => {
    const jsonString = JSON.stringify(generatedData, null, 2)
    navigator.clipboard.writeText(jsonString)
    alert('JSON이 복사되었습니다')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="결과 상세보기"
      size="lg"
      // FlowCanvas 브라우저 풀스크린 중 ESC가 모달까지 닫는 중첩 방지 (v0.4.0 T7 가드와 동일 취지)
      onEscapeKeyDown={(e) => { if (document.fullscreenElement) e.preventDefault() }}
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-sm font-semibold text-[#1F2937]">생성된 데이터</p>
            {hasFlow && (
              <div className="inline-flex rounded-md border border-[#E5E7EB] overflow-hidden text-sm">
                <button
                  onClick={() => setView('json')}
                  className={`px-3 py-1 ${view === 'json' ? 'bg-primary-500 text-white' : 'bg-white text-[#6B7280] hover:bg-[#F8FAFC]'}`}
                >
                  JSON
                </button>
                <button
                  onClick={() => setView('diagram')}
                  className={`px-3 py-1 border-l border-[#E5E7EB] ${view === 'diagram' ? 'bg-primary-500 text-white' : 'bg-white text-[#6B7280] hover:bg-[#F8FAFC]'}`}
                >
                  다이어그램
                </button>
              </div>
            )}
          </div>
          {hasFlow && view === 'diagram' ? (
            <div className="border border-[#E5E7EB] rounded-lg overflow-hidden" style={{ height: '24rem' }}>
              <FlowCanvas flowJson={generatedData} name={botName} readOnly scenarioNames={result?.bundle?.scenarios} />
            </div>
          ) : (
            <pre className="bg-[#F8FAFC] p-4 rounded-lg overflow-x-auto text-sm text-[#1F2937] max-h-96 overflow-y-auto">
              {JSON.stringify(generatedData, null, 2)}
            </pre>
          )}
        </div>

        <Button
          variant="primary"
          size="full"
          onClick={handleCopy}
        >
          JSON 복사
        </Button>
      </div>
    </Modal>
  )
}

export default ResultDetailModal

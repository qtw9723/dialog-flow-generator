import { Card, CardBody } from '../common/Card'
import { isUploadedResult, isAssembledResult } from '../../lib/resultEditGating.js'
import { Button } from '../common/Button'
import { Trash2, Eye, Archive, ArchiveRestore } from 'lucide-react'
import { formatKST } from '../../utils/datetime'
import { resultBotName, resultMeta } from '../../utils/resultMeta'
import { isArchived } from '../../lib/resultBundle/archiveFilter.js'
import { verificationStatus, VERIFICATION_LABELS } from '../../lib/resultBundle/verification.js'

export const ResultCard = ({ result, onView, onDelete, onToggleArchive, loading, canArchive }) => {
  const name = resultBotName(result)
  const { nodeCount, scenarioCount, esdCount, totalTokens } = resultMeta(result)
  const meta = [
    nodeCount ? `노드 ${nodeCount}개` : null,
    scenarioCount ? `시나리오 ${scenarioCount}개` : null,
    esdCount ? `ESD ${esdCount}개` : null,
    totalTokens ? `✨ ${totalTokens.toLocaleString()} 토큰` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Card className="overflow-hidden">
      <CardBody>
        <div className="mb-4">
          <h4 className="font-semibold text-[#1F2937] mb-1 truncate flex items-center gap-1.5" title={name}>
            <span className="truncate">🤖 {name}</span>
            {isUploadedResult(result) && (
              <span
                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]"
                title="솔루션에서 올린 기존 챗봇"
              >
                업로드
              </span>
            )}
            {isAssembledResult(result) && (
              <span
                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]"
                title="라이브러리에서 조립한 봇"
              >
                조립
              </span>
            )}
            {verificationStatus(result) === 'verified' ? (
              <span
                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0]"
                title={VERIFICATION_LABELS.verified}
              >
                검증 완료
              </span>
            ) : verificationStatus(result) !== 'none' && (
              <span
                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]"
                title={VERIFICATION_LABELS[verificationStatus(result)]}
              >
                초안
              </span>
            )}
            {isArchived(result) && (
              <span
                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]"
                title="보관 표시한 결과"
              >
                보관
              </span>
            )}
          </h4>
          {meta && <p className="text-xs text-[#374151] mb-1">{meta}</p>}
          {result.bundle?.created_by && (
            <p className="text-xs text-[#6B7280] mb-0.5">👤 {result.bundle.created_by}</p>
          )}
          <p className="text-xs text-[#6B7280]">
            {formatKST(result.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onView(result)}
            disabled={loading}
            className="flex-1"
          >
            <Eye className="h-4 w-4 mr-2" />
            보기
          </Button>
          {canArchive && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleArchive(result.id, !isArchived(result))}
              disabled={loading}
              title={isArchived(result) ? '보관 해제' : '보관'}
            >
              {isArchived(result) ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            onClick={() => onDelete(result.id)}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

export default ResultCard

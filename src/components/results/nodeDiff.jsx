import { getMentText, buildNodeMap } from '../../lib/nodeDiffHelpers.js'

export { getMentText, buildNodeMap }

export function NodeDiff({ nodeId, before, after }) {
  const beforeMent = getMentText(before)
  const afterMent = getMentText(after)
  const isAdded = !before
  const isRemoved = !after

  return (
    <div className="text-xs border border-gray-200 rounded p-2 bg-gray-50">
      <p className="font-mono text-gray-400 mb-1">{nodeId}</p>
      {isAdded && (
        <p className="text-green-700">
          + 추가: {after?.label || after?.type || ''}
          {afterMent ? ` "${afterMent}"` : ''}
        </p>
      )}
      {isRemoved && (
        <p className="text-red-600">
          - 삭제: {before?.label || before?.type || ''}
          {beforeMent ? ` "${beforeMent}"` : ''}
        </p>
      )}
      {!isAdded && !isRemoved && (
        <div className="space-y-0.5">
          {before?.label !== after?.label && (
            <p className="text-gray-600">
              <span className="line-through">{before?.label}</span> → {after?.label}
            </p>
          )}
          {beforeMent !== afterMent && beforeMent && (
            <p className="text-red-500 line-through">{beforeMent}</p>
          )}
          {beforeMent !== afterMent && afterMent && (
            <p className="text-green-700">{afterMent}</p>
          )}
          {before?.label === after?.label && beforeMent === afterMent && (
            <p className="text-gray-500">(구조·참조 변경)</p>
          )}
        </div>
      )}
    </div>
  )
}

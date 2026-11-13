export const ProgressBar = ({ current, total, label = null }) => {
  const percentage = (current / total) * 100

  return (
    <div className="mb-6">
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#1F2937]">
            {label}
          </span>
          <span className="text-xs text-[#6B7280]">
            {current} / {total}
          </span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
        <div
          className="h-full bg-primary-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export default ProgressBar

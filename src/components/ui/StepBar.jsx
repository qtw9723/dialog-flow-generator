export default function StepBar({ steps, currentIndex }) {
  return (
    <div className="flex items-center gap-2 mb-6 text-sm">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          {i > 0 && <span className="text-[#D1D5DB]">›</span>}
          <span
            className={
              i === currentIndex
                ? 'text-primary-500 font-medium'
                : i < currentIndex
                  ? 'text-[#9CA3AF] line-through'
                  : 'text-[#9CA3AF]'
            }
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

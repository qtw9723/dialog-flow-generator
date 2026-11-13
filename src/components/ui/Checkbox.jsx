export default function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer ${className}`}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-[#D1D5DB] accent-primary-500 cursor-pointer disabled:cursor-not-allowed"
        {...props}
      />
      {label && <span className="text-sm text-[#374151]">{label}</span>}
    </label>
  )
}

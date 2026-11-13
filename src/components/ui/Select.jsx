export default function Select({ children, className = '', ...props }) {
  return (
    <select
      className={`w-full rounded-md border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

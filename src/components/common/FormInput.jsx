import { cn } from "@/lib/utils"
import { FieldHelp } from "./FieldHelp"

export const FormInput = ({
  id,
  name,
  type = 'text',
  label,
  help = null,
  value,
  checked,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  error = null,
  options = [],
  multiple = false,
  radioOptions = [],
  className = '',
  rows = 3,
}) => {
  if (type === 'textarea') {
    return (
      <div className="mb-4">
        {label && (
          <label
            htmlFor={id}
            className={cn('mb-2 block text-sm font-semibold text-[#1F2937]', required && "after:ml-1 after:content-['*'] after:text-[#EF4444]")}
          >
            {label}
            {!required && <span className="after:content-none"> (선택사항)</span>}
            <FieldHelp text={help} />
          </label>
        )}
        <textarea
          id={id}
          name={name}
          value={value || ''}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={cn(
            "w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-0 disabled:bg-[#E5E7EB] disabled:text-[#6B7280]",
            error && "border-[#EF4444] focus-visible:ring-[#EF4444]",
            className
          )}
        />
        {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
      </div>
    )
  }

  if (type === 'select') {
    return (
      <div className="mb-4">
        {label && (
          <label
            htmlFor={id}
            className={cn('mb-2 block text-sm font-semibold text-[#1F2937]', required && "after:ml-1 after:content-['*'] after:text-[#EF4444]")}
          >
            {label}
            {!required && <span className="after:content-none"> (선택사항)</span>}
            <FieldHelp text={help} />
          </label>
        )}
        <select
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          className={cn(
            "w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-0 disabled:bg-[#E5E7EB] disabled:text-[#6B7280]",
            error && "border-[#EF4444] focus-visible:ring-[#EF4444]",
            className
          )}
        >
          <option value="">선택해주세요</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
      </div>
    )
  }

  if (type === 'radio') {
    return (
      <div className="mb-4">
        {label && (
          <label className={cn('mb-3 block text-sm font-semibold text-[#1F2937]', required && "after:ml-1 after:content-['*'] after:text-[#EF4444]")}>
            {label}
            {!required && <span className="after:content-none"> (선택사항)</span>}
          </label>
        )}
        <div className="space-y-2">
          {radioOptions.map((opt) => (
            <div key={opt.value} className="flex items-center">
              <input
                type="radio"
                id={`${id}-${opt.value}`}
                name={name}
                value={opt.value}
                checked={value === opt.value}
                onChange={onChange}
                disabled={disabled}
                className="h-4 w-4 accent-primary-500"
              />
              <label htmlFor={`${id}-${opt.value}`} className="ml-2 text-sm text-[#1F2937] cursor-pointer">
                {opt.label}
              </label>
            </div>
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
      </div>
    )
  }

  if (type === 'checkbox') {
    // For multiple checkboxes with options
    if (options.length > 0) {
      return (
        <div className="mb-4">
          {label && (
            <label className={cn('mb-3 block text-sm font-semibold text-[#1F2937]', required && "after:ml-1 after:content-['*'] after:text-[#EF4444]")}>
              {label}
              {!required && <span className="after:content-none"> (선택사항)</span>}
              <FieldHelp text={help} />
            </label>
          )}
          <div className="space-y-2">
            {options.map((opt) => (
              <div key={opt.value} className="flex items-center">
                <input
                  type="checkbox"
                  id={`${id}-${opt.value}`}
                  name={name}
                  value={opt.value}
                  checked={Array.isArray(value) && value.includes(opt.value)}
                  onChange={(e) => {
                    const newValue = Array.isArray(value) ? [...value] : []
                    if (e.target.checked) {
                      newValue.push(opt.value)
                    } else {
                      newValue.splice(newValue.indexOf(opt.value), 1)
                    }
                    onChange({ target: { name, value: newValue } })
                  }}
                  disabled={disabled}
                  className="h-4 w-4 accent-primary-500"
                />
                <label htmlFor={`${id}-${opt.value}`} className="ml-2 text-sm text-[#1F2937] cursor-pointer">
                  {opt.label}
                </label>
              </div>
            ))}
          </div>
          {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
        </div>
      )
    }

    // For single checkbox
    return (
      <div className="mb-4 flex items-center">
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={checked !== undefined ? checked : Boolean(value)}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          className="h-4 w-4 accent-primary-500 cursor-pointer"
        />
        {label && (
          <label htmlFor={id} className="ml-2 text-sm font-semibold text-[#1F2937] cursor-pointer">
            {label}
            {!required && <span> (선택사항)</span>}
          </label>
        )}
        {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
      </div>
    )
  }

  if (type === 'file') {
    return (
      <div className="mb-4">
        {label && (
          <label
            htmlFor={id}
            className={cn('mb-2 block text-sm font-semibold text-[#1F2937]', required && "after:ml-1 after:content-['*'] after:text-[#EF4444]")}
          >
            {label}
            {!required && <span className="after:content-none"> (선택사항)</span>}
          </label>
        )}
        <input
          id={id}
          type="file"
          name={name}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          className={cn(
            "w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-0 disabled:bg-[#E5E7EB] disabled:text-[#6B7280]",
            error && "border-[#EF4444] focus-visible:ring-[#EF4444]",
            className
          )}
          accept={multiple ? undefined : '.json'}
        />
        {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
      </div>
    )
  }

  // Default: text input
  return (
    <div className="mb-4">
      {label && (
        <label
          htmlFor={id}
          className={cn('mb-2 block text-sm font-semibold text-[#1F2937]', required && "after:ml-1 after:content-['*'] after:text-[#EF4444]")}
        >
          {label}
          {!required && <span className="after:content-none"> (선택사항)</span>}
          <FieldHelp text={help} />
        </label>
      )}
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1F2937] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-0 disabled:bg-[#E5E7EB] disabled:text-[#6B7280]",
          error && "border-[#EF4444] focus-visible:ring-[#EF4444]",
          className
        )}
      />
      {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
    </div>
  )
}

export default FormInput

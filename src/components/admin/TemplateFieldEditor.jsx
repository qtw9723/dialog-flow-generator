import { Button } from '../common/Button'

const TYPE_LABELS = [
  { value: 'text', label: '한 줄' },
  { value: 'textarea', label: '여러 줄' },
  { value: 'select', label: '선택' },
  { value: 'multi_select', label: '다중 선택' },
  { value: 'group_list', label: '반복 그룹' },
]

const optionsToText = (opts) => (Array.isArray(opts) ? opts.join('\n') : '')
const textToOptions = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean)

// 단일 템플릿 필드 편집기. allowNested=false면 group_list/중첩 미제공(하위 필드용).
// 주의: setField는 기존 필드 객체를 spread하므로 UI 미노출 고급 속성(showWhen 등)은 보존된다.
export function TemplateFieldEditor({ field, onChange, onRemove, allowNested = true }) {
  const setField = (patch) => onChange({ ...field, ...patch })
  const typeOptions = allowNested ? TYPE_LABELS : TYPE_LABELS.filter((t) => t.value !== 'group_list')
  const isOptionType = field.type === 'select' || field.type === 'multi_select'

  return (
    <div className="p-3 border border-[#E5E7EB] rounded-md bg-white space-y-2">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={field.name || ''}
          onChange={(e) => setField({ name: e.target.value })}
          placeholder="필드명"
          className="flex-1 rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        />
        <select
          value={field.type || 'text'}
          onChange={(e) => setField({ type: e.target.value })}
          className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          {typeOptions.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-[#6B7280] whitespace-nowrap">
          <input
            type="checkbox"
            checked={field.required !== false}
            onChange={(e) => setField({ required: e.target.checked })}
            className="h-4 w-4"
          />
          필수
        </label>
        <Button type="button" variant="danger" size="sm" onClick={onRemove}>삭제</Button>
      </div>

      {isOptionType && (
        <textarea
          value={optionsToText(field.options)}
          onChange={(e) => setField({ options: textToOptions(e.target.value) })}
          placeholder="옵션 (한 줄에 하나)"
          rows={3}
          className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        />
      )}

      {field.type === 'group_list' && allowNested && (
        <div className="ml-3 pl-3 border-l-2 border-[#E5E7EB] space-y-2">
          <p className="text-xs font-semibold text-[#6B7280]">하위 필드</p>
          {(field.fields || []).map((sub, i) => (
            <TemplateFieldEditor
              key={i}
              field={sub}
              allowNested={false}
              onChange={(updated) => {
                const fields = [...(field.fields || [])]
                fields[i] = updated
                setField({ fields })
              }}
              onRemove={() => setField({ fields: (field.fields || []).filter((_, j) => j !== i) })}
            />
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setField({ fields: [...(field.fields || []), { name: '', type: 'text', required: true }] })}
          >
            + 하위 필드 추가
          </Button>
        </div>
      )}
    </div>
  )
}

export default TemplateFieldEditor

import { FormInput } from '../common/FormInput'
import { Button } from '../common/Button'
import { SectionHelp } from '../common/SectionHelp'
import { TEMPLATE_FIELD_TYPES } from '../../lib/constants'
import { fullWidthFlags } from '../../lib/questions/fullWidthFlags'
import { fieldLabel } from '../../lib/questions/fieldOverrides'
import { resolveOptions, shouldShowField, makeEmptyItem, getFieldHelp, FIELD_VALIDATORS } from './scenarioFields'

// 단일 템플릿 필드 렌더러. group_list는 재귀적으로 하위 필드를 렌더한다.
export const TemplateFieldInput = ({ field, value, onChange, sharedPool, idPrefix, onBlur = () => {} }) => {
  const id = `${idPrefix}-${field.name}`

  if (field.type === TEMPLATE_FIELD_TYPES.GROUP_LIST) {
    const items = Array.isArray(value) ? value : []
    const updateItem = (index, subName, subValue) =>
      onChange(items.map((it, i) => (i === index ? { ...it, [subName]: subValue } : it)))
    const addItem = () => onChange([...items, makeEmptyItem(field)])
    const removeItem = (index) => onChange(items.filter((_, i) => i !== index))

    return (
      <div className="mb-4">
        <label className="mb-2 block text-sm font-semibold text-[#1F2937]">
          {fieldLabel(field)}{!field.required && <span> (선택사항)</span>}
        </label>
        <SectionHelp text={getFieldHelp(field)} />
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="p-3 border border-[#E5E7EB] rounded-lg bg-[#FAFBFC]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-[#6B7280]">{fieldLabel(field)} {index + 1}</span>
                <Button type="button" variant="danger" size="sm" onClick={() => removeItem(index)}>삭제</Button>
              </div>
              {/* 항목 안의 짧은 필드는 2열로 — 목록·긴 글만 한 줄 전체 */}
              <div className="grid gap-x-4 md:grid-cols-2">
                {(() => {
                  const visible = (field.fields || []).filter((sub) => shouldShowField(sub, item))
                  const full = fullWidthFlags(visible, (sub) => sub.type === TEMPLATE_FIELD_TYPES.GROUP_LIST || sub.type === 'textarea')
                  return visible.map((sub, k) => (
                    <div key={sub.name} className={full[k] ? 'md:col-span-2' : ''}>
                      <TemplateFieldInput
                        field={sub}
                        value={item[sub.name]}
                        onChange={(v) => updateItem(index, sub.name, v)}
                        sharedPool={sharedPool}
                        idPrefix={`${id}-${index}`}
                        onBlur={onBlur}
                      />
                    </div>
                  ))
                })()}
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={addItem} className="mt-2">
          + {fieldLabel(field)} 추가
        </Button>
      </div>
    )
  }

  if (field.type === TEMPLATE_FIELD_TYPES.SELECT) {
    return (
      <FormInput
        id={id} name={id} type="select" label={fieldLabel(field)} help={getFieldHelp(field)}
        value={value || ''} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        options={resolveOptions(field, sharedPool)} required={field.required}
      />
    )
  }

  if (field.type === TEMPLATE_FIELD_TYPES.MULTI_SELECT) {
    return (
      <FormInput
        id={id} name={id} type="checkbox" label={fieldLabel(field)} help={getFieldHelp(field)}
        value={Array.isArray(value) ? value : []}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        options={resolveOptions(field, sharedPool)} required={field.required}
      />
    )
  }

  // text / textarea (기본). field.validate가 있으면 데이터-구동 인라인 검증.
  const validator = field.validate && FIELD_VALIDATORS[field.validate]
  const fieldError = validator ? validator(value) : null
  return (
    <FormInput
      id={id} name={id}
      type={field.type === TEMPLATE_FIELD_TYPES.TEXTAREA ? 'textarea' : 'text'}
      label={fieldLabel(field)} help={getFieldHelp(field)} value={value || ''}
      onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
      required={field.required} error={fieldError}
    />
  )
}

export default TemplateFieldInput

import { Card, CardBody } from '../common/Card'
import { FormInput } from '../common/FormInput'
import { INPUT_TYPES } from '../../lib/constants'
import { ScenarioQuestionCard } from './ScenarioQuestionCard'

export const QuestionCard = ({
  question,
  value,
  onChange,
  onBlur = () => {},
  error,
  focusTarget,
  industry = '',
}) => {
  // Parse options and convert to { value, label } format if needed
  let parsedOptions = typeof question.options === 'string'
    ? JSON.parse(question.options)
    : question.options

  // Convert simple string array to { value, label } format for FormInput
  const options = Array.isArray(parsedOptions)
    ? parsedOptions.map((opt) => {
        // If it's already an object with value/label, keep it
        if (typeof opt === 'object' && opt.value && opt.label) {
          return opt
        }
        // If it's a string, convert to { value, label } format
        if (typeof opt === 'string') {
          return { value: opt, label: opt }
        }
        // Fallback
        return { value: String(opt), label: String(opt) }
      })
    : []

  const handleChange = (e) => {
    // Extract value from event object
    const newValue = e.target.value
    onChange(newValue)
  }

  const handleStructuredFieldChange = (fieldName, fieldValue) => {
    const currentValue = value || {}
    const newValue = {
      ...currentValue,
      [fieldName]: fieldValue
    }
    onChange(newValue)
  }

  // Handle TEMPLATED type questions
  if (question.input_type === INPUT_TYPES.TEMPLATED && question.template) {
    return (
      <ScenarioQuestionCard
        question={question}
        template={question.template}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        error={error}
        focusTarget={focusTarget}
        industry={industry}
      />
    )
  }

  // Handle STRUCTURED type questions
  if (question.input_type === INPUT_TYPES.STRUCTURED) {
    const fields = typeof question.fields === 'string'
      ? JSON.parse(question.fields)
      : question.fields

    return (
      <Card className="mb-6">
        <CardBody>
          <h3 className="mb-2 text-lg font-semibold text-[#1F2937]">
            {question.text}
          </h3>
          {question.description && (
            <p className="mb-4 text-sm text-[#6B7280]">
              {question.description}
            </p>
          )}
          <div className="space-y-4">
            {fields.map((field) => (
              <FormInput
                key={field.name}
                id={`question-${question.id}-${field.name}`}
                name={`question-${question.id}-${field.name}`}
                type={field.type || 'textarea'}
                label={field.name}
                value={(value && value[field.name]) || ''}
                onChange={(e) => handleStructuredFieldChange(field.name, e.target.value)}
                onBlur={onBlur}
                error={error && error[field.name]}
                required={question.is_required}
              />
            ))}
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <CardBody>
        <h3 className="mb-2 text-lg font-semibold text-[#1F2937]">
          {question.text}
        </h3>
        {question.description && (
          <p className="mb-4 text-sm text-[#6B7280]">
            {question.description}
          </p>
        )}
        <FormInput
          id={`question-${question.id}`}
          name={`question-${question.id}`}
          type={question.input_type}
          value={value}
          onChange={handleChange}
          onBlur={onBlur}
          error={error}
          options={options}
          required={question.is_required}
        />
      </CardBody>
    </Card>
  )
}

export default QuestionCard

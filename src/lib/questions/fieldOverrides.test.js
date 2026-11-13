import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { withFieldOverrides, fieldLabel } from './fieldOverrides.js'

const tpl = {
  id: 't',
  fields: [
    { name: '시나리오 이름', type: 'text', required: true },
    { name: '완료 시 결과', type: 'textarea', required: true },
  ],
}

Deno.test('withFieldOverrides — 완료 시 결과는 표시명만 바뀌고 선택 입력, 저장 키(name)는 그대로', () => {
  const out = withFieldOverrides(tpl)
  assertEquals(out.fields[1], { name: '완료 시 결과', type: 'textarea', required: false, label: '시나리오 마무리 안내' })
  assertEquals(out.fields[0], tpl.fields[0])
  assertEquals(fieldLabel(out.fields[1]), '시나리오 마무리 안내')
  assertEquals(fieldLabel(out.fields[0]), '시나리오 이름')
})

Deno.test('withFieldOverrides — 원본 불변, null 안전', () => {
  withFieldOverrides(tpl)
  assertEquals(tpl.fields[1].required, true)
  assertEquals(withFieldOverrides(null), null)
})

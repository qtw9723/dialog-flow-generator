import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { attachTemplate } from "./attachTemplate.js"

// QuestionCard는 input_type==='templated' && question.template일 때만 시나리오 편집기를 연다.
// template을 안 붙이면 일반 입력으로 폴백해 객체 배열이 "[object Object]"로 뭉개지고,
// q.template에 의존하는 시나리오 검증도 통째로 건너뛴다(조용한 검증 누락).

const TEMPLATES = [
  { id: 't1', name: '시나리오 템플릿', fields: [{ name: '시나리오 이름' }] },
  { id: 't2', name: '다른 템플릿', fields: [] },
]

Deno.test("template_id가 있으면 해당 템플릿을 붙인다", () => {
  const q = { id: 'q1', input_type: 'templated', template_id: 't1' }
  assertEquals(attachTemplate(q, TEMPLATES).template, TEMPLATES[0])
})

Deno.test("template_id가 없으면 template은 null", () => {
  const q = { id: 'q2', input_type: 'text' }
  assertEquals(attachTemplate(q, TEMPLATES).template, null)
})

Deno.test("template_id가 templates에 없으면 null — undefined가 아니라", () => {
  const q = { id: 'q3', input_type: 'templated', template_id: '없는id' }
  const out = attachTemplate(q, TEMPLATES)
  assertEquals(out.template, null)
  assertEquals('template' in out, true)
})

Deno.test("templates가 아직 안 로드됐어도 안전(빈 배열·undefined)", () => {
  const q = { id: 'q4', input_type: 'templated', template_id: 't1' }
  assertEquals(attachTemplate(q, []).template, null)
  assertEquals(attachTemplate(q, undefined).template, null)
  assertEquals(attachTemplate(q, null).template, null)
})

Deno.test("원본 질문의 다른 필드는 그대로 보존된다", () => {
  const q = { id: 'q5', text: '시나리오 입력', input_type: 'templated', template_id: 't1', is_required: true, order_index: 3 }
  const out = attachTemplate(q, TEMPLATES)
  assertEquals(out.id, 'q5')
  assertEquals(out.text, '시나리오 입력')
  assertEquals(out.is_required, true)
  assertEquals(out.order_index, 3)
})

Deno.test("입력을 변형하지 않는다(원본 불변)", () => {
  const q = { id: 'q6', input_type: 'templated', template_id: 't1' }
  attachTemplate(q, TEMPLATES)
  assertEquals('template' in q, false)
})

Deno.test("질문이 비어도 터지지 않는다", () => {
  assertEquals(attachTemplate(null, TEMPLATES), null)
  assertEquals(attachTemplate(undefined, TEMPLATES), undefined)
})

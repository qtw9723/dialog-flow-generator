// 설문 질문을 화면 단계로 묶는다(질문 DB 순서 그대로, 데이터 구동).
// 시나리오 입력(templated) 질문은 각각 한 단계, 그 앞의 짧은 질문들은 '기본 정보',
// 사이·뒤의 질문들은 '추가 설정'으로 한 화면에 모은다 — 질문 하나에 한 화면씩 넘기던 9단계를 3단계로.

const TEMPLATED = 'templated'

/** @returns {{ key: string, title: string, questions: any[] }[]} */
export function groupSteps(questions) {
  if (!Array.isArray(questions)) return []
  const steps = []
  let pending = []
  let extraCount = 0
  const flush = () => {
    if (!pending.length) return
    const isFirst = steps.length === 0
    if (isFirst) steps.push({ key: 'basic', title: '기본 정보', questions: pending })
    else {
      extraCount += 1
      steps.push({ key: extraCount === 1 ? 'extra' : `extra-${extraCount}`, title: '추가 설정', questions: pending })
    }
    pending = []
  }
  for (const q of questions) {
    if (q?.input_type === TEMPLATED) {
      flush()
      steps.push({ key: `templated-${q.id}`, title: q.text, questions: [q] })
    } else {
      pending.push(q)
    }
  }
  flush()
  return steps
}

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// 두 생성 흐름은 같은 가드를 써야 한다.
// ⚠ 이 저장소의 만성 실패는 "형제 경로 중 하나만 고쳐짐"이다. 실제로 2026-09-28까지
//    NlScenarioFlow에는 가드가 4곳, PocDocGenerateFlow에는 0곳이었다.
const FLOWS = [
  'src/components/nlScenario/NlScenarioFlow.jsx',
  'src/components/pocDoc/PocDocGenerateFlow.jsx',
]

Deno.test('두 생성 흐름 모두 hasUsableScenario로 빈 시나리오를 막는다', async () => {
  for (const path of FLOWS) {
    const src = await Deno.readTextFile(path)
    const uses = [...src.matchAll(/hasUsableScenario/g)].length
    // import 1 + 제출 가드 1 + 배너 1 + 버튼 1 = 최소 4
    assertEquals(uses >= 4, true, `${path}의 hasUsableScenario 사용 횟수: ${uses} (최소 4)`)
  }
})

// ⚠ "가드가 createResult보다 앞에 온다"는 식의 위치 비교를 쓰지 말 것.
//    NlScenarioFlow는 빠른 생성 경로의 createResult가 :128, 제출 가드가 :247이라
//    올바른 파일에서도 거짓 실패한다(계획 작성 중 실제로 이 실수를 했다).
//    대신 두 흐름이 같은 가드 문구를 쓰는지 본다.
const GUARD_MESSAGE = '시나리오가 하나도 없습니다. 시나리오를 1개 이상 추가한 뒤 생성하세요.'

Deno.test('두 흐름이 같은 제출 가드 문구를 쓴다', async () => {
  for (const path of FLOWS) {
    const src = await Deno.readTextFile(path)
    assertEquals(src.includes(GUARD_MESSAGE), true, `${path}: 제출 가드 문구가 없다`)
    assertEquals(src.includes('hasUsableScenario(scenarios)'), true, `${path}: scenarios 가드가 없다`)
  }
})

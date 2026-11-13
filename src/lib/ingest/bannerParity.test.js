import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// 두 생성 흐름은 실패 사유를 모두 배너로 채워야 한다.
//
// ⚠ 왜 이 테스트가 있는가: 이 저장소의 만성 실패는 "형제 경로 중 한쪽만 고쳐짐"이다.
//    2026-09-28 최종 리뷰에서 NlScenarioFlow.handleParse는 실패 사유를
//    summarizeIngestFailures로 배너에 채우는데, 같은 자리인
//    PocDocGenerateFlow.handleParse는 catch가 사유를 통째로 버리고 있었다
//    (429·401·응답 잘림이 전부 빈 미리보기 하나로 뭉개졌다).
//    PocDoc이 주 입력 경로라 무음 실패의 영향이 더 컸다.
//    scenarioGuard.test.js가 hasUsableScenario에 대해 하는 일을, 여기서는 배너 채우기에 대해 한다.
const FLOWS = [
  'src/components/nlScenario/NlScenarioFlow.jsx',
  'src/components/pocDoc/PocDocGenerateFlow.jsx',
]

// import 문에는 괄호가 붙지 않으므로 '(' 까지 세면 실제 호출 횟수만 남는다.
const CALL_RE = /summarizeIngestFailures\(/g

// 두 흐름의 실패 경로 개수는 원래 다르다(NL에는 '바로 생성' 경로가 하나 더 있다).
// 2026-09-28 실측: NlScenarioFlow 3회, PocDocGenerateFlow 2회. 구조 차이만큼만 허용한다.
const MAX_GAP = 1

async function countCalls(path) {
  const src = await Deno.readTextFile(path)
  return [...src.matchAll(CALL_RE)].length
}

Deno.test('두 생성 흐름 모두 실패 사유를 배너로 채운다(한쪽이 0이면 실패)', async () => {
  for (const path of FLOWS) {
    const calls = await countCalls(path)
    assertEquals(
      calls >= 1,
      true,
      `${path}: summarizeIngestFailures 호출이 ${calls}회 — 실패 사유를 조용히 버리고 있다`,
    )
  }
})

Deno.test('두 흐름의 배너 채우기 횟수가 크게 어긋나지 않는다', async () => {
  const counts = []
  for (const path of FLOWS) counts.push(await countCalls(path))
  const gap = Math.abs(counts[0] - counts[1])
  assertEquals(
    gap <= MAX_GAP,
    true,
    `배너 채우기 횟수 차이 ${gap} (허용 ${MAX_GAP}) — ${FLOWS[0]}: ${counts[0]}회, ${FLOWS[1]}: ${counts[1]}회. ` +
      '한쪽 흐름에만 실패 경로가 추가됐는지 확인하라.',
  )
})

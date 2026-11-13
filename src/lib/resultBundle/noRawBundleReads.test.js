import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// 소비처가 정규화를 우회해 원시 generation_tiers를 읽는 것을 막는다.
// 우회를 허용하면 result.bundle 정규화가 반쪽만 적용된 상태로 서서히 되돌아간다
// (이 프로젝트의 반복 실패 모드: 규칙 카테고리 복제 7 vs 9, BTN_PRIMARY 4중 복제).
//
// 허용 예외 — 근거를 반드시 남긴다:
const ALLOWED = new Map([
  // 결과 행이 아니라 '레퍼런스 학습 데이터'의 generation_tiers다(다른 엔티티).
  ['src/components/LearningDataModal.jsx', '레퍼런스 학습 데이터 — 결과 번들이 아님'],
])

// cwd에 의존하지 않도록 테스트 파일 기준으로 경로를 잡는다.
const COMPONENTS_DIR = new URL('../../components', import.meta.url).pathname
const REPO_REL = (abs) => abs.slice(abs.indexOf('src/components'))

async function* walk(dir) {
  for await (const e of Deno.readDir(dir)) {
    const path = `${dir}/${e.name}`
    if (e.isDirectory) yield* walk(path)
    else if (e.name.endsWith('.jsx') || e.name.endsWith('.js')) yield path
  }
}

/**
 * 주석을 지운 소스를 돌려준다 — 설명문에 키 이름이 나오는 것은 위반이 아니다.
 * 블록 주석(/* *\/ · JSX {/* *\/})과 줄 주석(//)을 모두 없앤다.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')   // 블록 주석 (JSX {/* */}의 안쪽 포함)
    .replace(/^\s*\/\/.*$/gm, '')        // 줄 주석
}

Deno.test('src/components는 원시 generation_tiers를 읽지 않는다', async () => {
  const offenders = []
  for await (const abs of walk(COMPONENTS_DIR)) {
    if (abs.includes('.test.')) continue
    const rel = REPO_REL(abs)
    if (ALLOWED.has(rel)) continue

    const stripped = stripComments(await Deno.readTextFile(abs))
    stripped.split('\n').forEach((line, i) => {
      if (line.includes('generation_tiers')) offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assertEquals(
    offenders,
    [],
    '원시 generation_tiers 읽기를 발견했다. result.bundle을 쓰거나, 정당한 예외라면 ' +
    `noRawBundleReads.test.js의 ALLOWED에 근거와 함께 추가하라:\n${offenders.join('\n')}`,
  )
})

Deno.test('허용 목록의 파일이 실제로 존재한다 (죽은 예외 방지)', async () => {
  const root = new URL('../../..', import.meta.url).pathname
  for (const rel of ALLOWED.keys()) {
    const stat = await Deno.stat(`${root}${rel}`).catch(() => null)
    assertEquals(stat !== null, true, `${rel}이 없다 — ALLOWED에서 지워라`)
  }
})

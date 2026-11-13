import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// ── 재이중화 방지: 결과 상태의 구현은 src/context/ResultsContext.jsx 한 벌뿐이다.
//    v0.11.0 항목 6b 이전에는 같은 이름의 훅이 hooks/useResults.js에도 있었고, 화면 절반이
//    각각 다른 상태 트리를 봤다(목록·생성은 훅, 상세·편집은 컨텍스트). 같은 이름이라 호출부만
//    보면 구분이 안 됐고, setResultArchived는 이름만 같고 엔드포인트가 달랐다.
//    선례: resultBundle/noRawBundleReads.test.js·refShared.test.js — 같은 스타일
//    (테스트 파일 기준 상대경로, 주석 제거 후 검사)을 따른다.

const SRC_DIR = new URL('..', import.meta.url).pathname.replace(/\/$/, '')   // .../src
const COMPONENTS_DIR = `${SRC_DIR}/components`
const REPO_REL = (abs) => abs.slice(abs.indexOf('src/'))

async function* walk(dir) {
  for await (const e of Deno.readDir(dir)) {
    const path = `${dir}/${e.name}`
    if (e.isDirectory) yield* walk(path)
    else if (e.name.endsWith('.jsx') || e.name.endsWith('.js') || e.name.endsWith('.ts')) yield path
  }
}

/**
 * 주석을 지운 소스를 돌려준다 — 설명문에 옛 경로가 나오는 것은 위반이 아니다.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')   // 블록 주석 (JSX {/* */}의 안쪽 포함)
    .replace(/^\s*\/\/.*$/gm, '')        // 줄 주석
}

Deno.test('src/hooks/useResults.js는 존재하지 않는다 (두 벌째 구현 부활 금지)', async () => {
  const stat = await Deno.stat(`${SRC_DIR}/hooks/useResults.js`).catch(() => null)
  assertEquals(
    stat === null,
    true,
    'src/hooks/useResults.js가 되살아났다. 결과 상태는 src/context/ResultsContext.jsx 한 곳에서만 관리한다.',
  )
})

Deno.test('src/components 어느 파일도 hooks/useResults에서 import하지 않는다', async () => {
  const offenders = []
  for await (const abs of walk(COMPONENTS_DIR)) {
    if (abs.includes('.test.')) continue
    const rel = REPO_REL(abs)
    const stripped = stripComments(await Deno.readTextFile(abs))
    stripped.split('\n').forEach((line, i) => {
      if (/hooks\/useResults/.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assertEquals(
    offenders,
    [],
    `hooks/useResults import를 발견했다. ../context/ResultsContext의 useResults를 써라:\n${offenders.join('\n')}`,
  )
})

Deno.test('useResults를 export하는 파일은 정확히 하나다', async () => {
  const exporters = []
  for await (const abs of walk(SRC_DIR)) {
    if (abs.includes('.test.')) continue
    const stripped = stripComments(await Deno.readTextFile(abs))
    // export function useResults / export const useResults / export { useResults }
    const declares = /export\s+(?:async\s+)?function\s+useResults\b/.test(stripped)
      || /export\s+(?:const|let|var)\s+useResults\b/.test(stripped)
      || /export\s*\{[^}]*\buseResults\b[^}]*\}(?!\s*from)/.test(stripped)
    if (declares) exporters.push(REPO_REL(abs))
  }
  assertEquals(
    exporters,
    ['src/context/ResultsContext.jsx'],
    `useResults export가 한 곳이 아니다(재이중화). 발견: ${exporters.join(', ') || '없음'}`,
  )
})

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// 브랜드색은 theme.css의 토큰이 정본이다. 컴포넌트에서 hex를 다시 쓰면 색이 또 갈라진다
// (2026-10-07 실측: #0052CC 228회 · #0047B3 23회 · #003d99 9회로 흩어져 hover가 화면마다 달랐다).
const RE = /#0052CC|#0047B3|#003D99/i

// className으로 바꿀 수 없어 남긴 곳만 적는다. 새로 추가할 땐 이유를 함께 적을 것.
const ALLOW = new Set([
  // 선택된 노드의 SVG stroke를 강조하는 JS 리터럴 — presentation attribute라 유틸리티
  // 클래스로 바꿀 수 없다(다이어그램 렌더러 손상 위험, Task 11 브리프 명시).
  'src/components/flow/FlowCanvas.jsx',
])

async function jsxFiles(dir) {
  const out = []
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory) out.push(...await jsxFiles(p))
    // .js/.ts도 훑는다 — .jsx/.tsx만 보면 .js 모듈에 선언한 색이 검사를 빠져나간다
    // (Task 4에서 실제로 이 구멍을 발견해 메웠다).
    else if (/\.(jsx|tsx|js|ts)$/.test(p)) out.push(p)
  }
  return out
}

Deno.test('컴포넌트에 브랜드 hex를 다시 쓰지 않는다 — primary-* 토큰을 쓸 것', async () => {
  const offenders = []
  for (const p of await jsxFiles('src/components')) {
    if (ALLOW.has(p)) continue
    if (RE.test(await Deno.readTextFile(p))) offenders.push(p)
  }
  assertEquals(offenders, [])
})

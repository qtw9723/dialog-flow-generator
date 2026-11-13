import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// 버튼 스타일 문자열을 컴포넌트 안에 다시 만드는 것을 막는다.
// 선례: _shared/modelLiteral.test.ts(모델 리터럴), bannerParity.test.js(배너 호출).
// ⚠ 이 검사가 없으면 다시 갈라진다 — 실제로 2026-08-28 4곳 → 2026-10-07 5곳으로 늘었다.
// const/let/var를 모두 잡는다 — const만 보면 `let BTN_X =`로 빠져나간다(2026-10-08 변이로 확인).
const RE = /\b(?:const|let|var)\s+BTN_[A-Za-z0-9_]*\s*=/

async function jsxFiles(dir) {
  const out = []
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory) out.push(...await jsxFiles(p))
    // .js도 훑는다 — src/components에 .js 모듈이 있고(buttonVariantClasses.js 등)
    // 확장자를 좁히면 거기 선언한 상수가 검사를 빠져나간다(2026-10-08 변이로 확인).
    else if (/\.(jsx|tsx|js|ts)$/.test(p)) out.push(p)
  }
  return out
}

Deno.test('컴포넌트에 로컬 버튼 스타일 상수를 다시 만들지 않는다 — common/Button을 쓸 것', async () => {
  const offenders = []
  for (const p of await jsxFiles('src/components')) {
    if (RE.test(await Deno.readTextFile(p))) offenders.push(p)
  }
  assertEquals(offenders, [])
})

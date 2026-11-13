import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// 모델명은 _shared/llmModel.ts 한 곳에만 있어야 한다.
// ⚠ 이 저장소는 같은 목록이 여러 곳에 복제됐다가 한 곳만 고쳐지는 사고를 반복했다
//    (규칙 카테고리 7 대 9, BTN_PRIMARY 5벌, results/admin-results PATCH 4분기).
//    모델명도 12곳에 흩어져 있었고 실제로 갈라졌다 — gpt-4o 5곳 대 gpt-5.2 7곳.
const ALLOWED = new Set([
  'supabase/functions/_shared/llmModel.ts',
  // 단가표는 "어느 모델의 단가인가"를 키로 적어야 하므로 모델명이 등장한다.
  'supabase/functions/dialogflow-generator/flow/usage.ts',
])

const MODEL_LITERAL = /["'`]gpt-[0-9][^"'`]*["'`]/

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory) yield* walk(path)
    else if (entry.isFile && path.endsWith('.ts')) yield path
  }
}

Deno.test('모델명 리터럴은 _shared/llmModel.ts 밖에 있으면 안 된다', async () => {
  const offenders: string[] = []
  for await (const path of walk('supabase/functions')) {
    if (path.includes('.test.')) continue
    if (ALLOWED.has(path)) continue
    const src = await Deno.readTextFile(path)
    if (MODEL_LITERAL.test(src)) offenders.push(path)
  }
  assertEquals(offenders, [], `모델명을 직접 적은 파일: ${offenders.join(', ')}`)
})

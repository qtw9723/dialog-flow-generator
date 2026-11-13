import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { SCENARIO_DOC_ACCEPT, MULTI_INGEST_ACCEPT } from './fileAccept.js'

// 단일 목적 입력(JSON 전용·CSV 전용)은 문서 인입 목록과 성격이 달라 예외다.
// ⚠ **파일 단위로 면제하지 말 것.** ApiReferenceManager.jsx는 :122(문서 인입, 고쳐야 함)와
//    :183(JSON 전용, 면제)을 한 파일에 같이 갖고 있다. 파일로 면제하면 :122가 빠져나간다
//    (계획 작성 중 실제로 이 실수를 했다). 그래서 **accept 값**으로 면제한다.
const EXEMPT_VALUES = new Set([
  'application/json,.json',
  '.json,application/json',
  '.json',
  '.csv,text/csv',
])

async function* walk(dir) {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory) yield* walk(path)
    else if (entry.isFile && path.endsWith('.jsx')) yield path
  }
}

Deno.test('문서 인입 accept 목록은 fileAccept.js에서만 온다', async () => {
  const offenders = []
  for await (const path of walk('src/components')) {
    const src = await Deno.readTextFile(path)
    // accept="...": 리터럴 문자열을 직접 적은 경우만 잡는다. accept={상수}는 통과.
    for (const m of src.matchAll(/accept="([^"]*)"/g)) {
      if (EXEMPT_VALUES.has(m[1])) continue
      offenders.push(`${path}: ${m[1]}`)
    }
  }
  assertEquals(offenders, [], `accept 리터럴을 직접 적은 곳: ${offenders.join(' | ')}`)
})

Deno.test('docx가 두 문서 목록에 모두 들어 있다', () => {
  assertEquals(SCENARIO_DOC_ACCEPT.includes('.docx'), true)
  assertEquals(MULTI_INGEST_ACCEPT.includes('.docx'), true)
})

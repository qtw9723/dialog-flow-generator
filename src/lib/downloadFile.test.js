import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { downloadBlob, downloadText, downloadJson, downloadCsv } from './downloadFile.js'

// 최소 DOM 스텁 — 순수 함수가 아니라 DOM 부작용이 계약이므로 호출 순서를 검증한다.
function stubDom() {
  const calls = []
  const anchor = {
    href: '', download: '', style: {},
    click: () => calls.push(['click', anchor.href, anchor.download]),
  }
  globalThis.document = {
    createElement: () => anchor,
    body: {
      appendChild: () => calls.push(['append']),
      removeChild: () => calls.push(['remove']),
    },
  }
  // ⚠ globalThis.URL을 통째로 바꾸면 assertEquals의 `a instanceof URL`이 깨진다.
  //    실제 URL 생성자는 두고 **메서드만** 갈아끼운다.
  URL.createObjectURL = (b) => { calls.push(['create', b.type]); return 'blob:x' }
  URL.revokeObjectURL = () => calls.push(['revoke'])
  return { calls, anchor }
}

Deno.test('append → click → remove 순서를 지킨다 (일부 브라우저는 미부착 a의 click을 무시)', async () => {
  const { calls } = stubDom()
  downloadText('a.txt', 'hi')
  await new Promise((r) => setTimeout(r, 5))
  assertEquals(calls.map((c) => c[0]), ['create', 'append', 'click', 'remove', 'revoke'])
})

Deno.test('revoke는 click 이후 다음 틱에 (즉시 회수하면 빈 파일이 받아질 수 있다)', () => {
  const { calls } = stubDom()
  downloadText('a.txt', 'hi')
  assertEquals(calls.map((c) => c[0]).includes('revoke'), false, '동기 구간에 revoke가 있으면 안 된다')
})

Deno.test('파일명이 anchor.download에 그대로 들어간다', () => {
  const { anchor } = stubDom()
  downloadText('한글 이름.csv', 'x')
  assertEquals(anchor.download, '한글 이름.csv')
})

Deno.test('MIME: json / csv / text', () => {
  let c = stubDom().calls
  downloadJson('a.json', { a: 1 })
  assertEquals(c[0][1], 'application/json')

  c = stubDom().calls
  downloadCsv('a.csv', 'x,y')
  assertEquals(c[0][1], 'text/csv;charset=utf-8')

  c = stubDom().calls
  downloadText('a.txt', 'x')
  assertEquals(c[0][1], 'text/plain;charset=utf-8')
})

Deno.test('downloadJson은 2칸 들여쓰기로 직렬화한다', () => {
  let captured = ''
  const orig = globalThis.Blob
  globalThis.Blob = class { constructor(parts, opts) { captured = parts[0]; this.type = opts?.type } }
  stubDom()
  downloadJson('a.json', { a: 1 })
  globalThis.Blob = orig
  assertEquals(captured, '{\n  "a": 1\n}')
})

Deno.test('downloadBlob은 주어진 Blob을 그대로 쓴다', () => {
  const { calls } = stubDom()
  downloadBlob('a.bin', new Blob(['x'], { type: 'application/octet-stream' }))
  assertEquals(calls[0][1], 'application/octet-stream')
})

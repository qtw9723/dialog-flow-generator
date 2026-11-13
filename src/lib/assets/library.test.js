import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { ASSET_BADGES, ASSET_BADGE_STYLES, badgeOf, mergeLibraryItems, assetErrorMessage } from './library.js'

const refs = [{ id: 'r1', name: '기반 예약', description: '큐레이션', flow_json: { a: 1 } }]
const assets = [
  { id: 'a1', name: '내 주문', description: '', flow_json: { b: 1 }, assets: { esd_schemas: [{ name: 'X' }], nlp: { intents: [], entities: [] }, api_defs: [] }, owner_email: 'me@x.com' },
  { id: 'a2', name: '남의 배송', description: '', flow_json: { c: 1 }, assets: null, owner_email: 'you@x.com' },
]

Deno.test('배지 3종의 라벨', () => {
  assertEquals(ASSET_BADGES, { reference: '기반 자료', mine: '내 자산', team: '팀 자산' })
})

Deno.test('badgeOf: 레퍼런스는 기반 자료', () => {
  assertEquals(badgeOf({ kind: 'reference', owner_email: null }, 'me@x.com'), 'reference')
})

Deno.test('badgeOf: 내 이메일이면 내 자산, 아니면 팀 자산', () => {
  assertEquals(badgeOf({ kind: 'asset', owner_email: 'me@x.com' }, 'me@x.com'), 'mine')
  assertEquals(badgeOf({ kind: 'asset', owner_email: 'you@x.com' }, 'me@x.com'), 'team')
})

Deno.test('badgeOf: 세션 없는 master 관리자는 전부 팀 자산', () => {
  assertEquals(badgeOf({ kind: 'asset', owner_email: 'me@x.com' }, null), 'team')
  assertEquals(badgeOf({ kind: 'asset', owner_email: null }, null), 'team')
})

Deno.test('badgeOf: 이메일 대소문자·공백은 무시한다', () => {
  assertEquals(badgeOf({ kind: 'asset', owner_email: ' Me@X.com ' }, 'me@x.com'), 'mine')
})

Deno.test('mergeLibraryItems: 레퍼런스가 먼저, 자산이 뒤', () => {
  const out = mergeLibraryItems(refs, assets, 'me@x.com')
  assertEquals(out.map((i) => i.id), ['r1', 'a1', 'a2'])
  assertEquals(out.map((i) => i.badge), ['reference', 'mine', 'team'])
  assertEquals(out.map((i) => i.kind), ['reference', 'asset', 'asset'])
})

Deno.test('mergeLibraryItems: 레퍼런스의 assets는 null이고 자산의 assets는 그대로', () => {
  const out = mergeLibraryItems(refs, assets, 'me@x.com')
  assertEquals(out[0].assets, null)
  assertEquals(out[1].assets.esd_schemas.length, 1)
})

Deno.test('mergeLibraryItems: 배열이 아니면 빈 목록으로 다룬다', () => {
  assertEquals(mergeLibraryItems(null, undefined, null), [])
})

Deno.test('assetErrorMessage: 서버 영문을 한국어로 바꾼다', () => {
  assertEquals(assetErrorMessage(new Error('Unauthorized')), '로그인한 계정에서만 자산을 등록·삭제할 수 있습니다.')
  assertEquals(assetErrorMessage(new Error('Forbidden')), '본인이 등록한 자산만 삭제할 수 있습니다.')
  assertEquals(assetErrorMessage(new Error('서버 폭발')), '서버 폭발')
  assertEquals(assetErrorMessage(null), '자산 작업에 실패했습니다.')
  assertEquals(assetErrorMessage(123), '자산 작업에 실패했습니다.')
})

Deno.test('assetErrorMessage: 정보 0인 useApi 고정 문구는 한국어로 바꾼다', () => {
  assertEquals(
    assetErrorMessage(new Error('API request failed')),
    '요청이 실패했습니다. 잠시 후 다시 시도하거나, 해당 기능이 배포되어 있는지 확인해 주세요.',
  )
})

Deno.test('assetErrorMessage: 브라우저 네트워크 실패 고정 문구는 한국어로 바꾼다', () => {
  assertEquals(
    assetErrorMessage(new Error('Failed to fetch')),
    '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',
  )
})

Deno.test('assetErrorMessage: 정보가 있는 서버 메시지는 그대로 통과시킨다(임의로 뭉뚱그리지 않는다)', () => {
  assertEquals(assetErrorMessage(new Error('이름은 필수입니다.')), '이름은 필수입니다.')
})

Deno.test('배지 라벨과 스타일이 같은 키 집합을 쓴다 (한쪽만 늘면 배지가 조용히 깨진다)', () => {
  assertEquals(Object.keys(ASSET_BADGE_STYLES).sort(), Object.keys(ASSET_BADGES).sort())
})

Deno.test('badgeOf가 낼 수 있는 모든 값이 두 맵에 있다', () => {
  for (const b of ['reference', 'mine', 'team']) {
    assertEquals(typeof ASSET_BADGES[b], 'string')
    assertEquals(typeof ASSET_BADGE_STYLES[b], 'string')
  }
})

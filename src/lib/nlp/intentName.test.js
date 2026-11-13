import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { intentNameOf } from './intentName.js'

// 이 파일이 문자 클래스의 계약을 고정한다 — `_shared/intentName.ts`는 이 규칙을 re-export만 한다.
// 여기서 통과하는 동작이 엣지함수(NLP 파생)와 프론트(자산 귀속) 양쪽의 이름 규칙이다.

Deno.test('intentNameOf: 한글은 남긴다(음절·자모)', () => {
  assertEquals(intentNameOf('매장정보'), '매장정보')
  assertEquals(intentNameOf('예약'), '예약')
  assertEquals(intentNameOf('ㄱㄴㄷ'), 'ㄱㄴㄷ')   // 호환 자모(U+3130–U+318F)도 허용 문자다
})

Deno.test('intentNameOf: 영문·숫자는 남긴다', () => {
  assertEquals(intentNameOf('FAQ2'), 'FAQ2')
  assertEquals(intentNameOf('as1234'), 'as1234')
  assertEquals(intentNameOf('VIP등급3안내'), 'VIP등급3안내')
})

Deno.test('intentNameOf: 공백은 제거한다(솔루션 인텐트명은 공백 없는 짧은 이름)', () => {
  assertEquals(intentNameOf('매장 예약'), '매장예약')
  assertEquals(intentNameOf('  배송 조회  '), '배송조회')
  assertEquals(intentNameOf('탭\t사이'), '탭사이')
  assertEquals(intentNameOf('줄\n바꿈'), '줄바꿈')
})

Deno.test('intentNameOf: 구두점·기호는 제거한다', () => {
  assertEquals(intentNameOf('예약 변경/취소'), '예약변경취소')
  assertEquals(intentNameOf('A/S 접수'), 'AS접수')
  assertEquals(intentNameOf('환불(부분)'), '환불부분')
  assertEquals(intentNameOf('Q&A'), 'QA')
  assertEquals(intentNameOf('주문·배송 조회'), '주문배송조회')
  assertEquals(intentNameOf('예약-확인'), '예약확인')
  assertEquals(intentNameOf('매장 정보!'), '매장정보')
})

Deno.test('intentNameOf: 밑줄도 제거한다(중복 접미사 _2와 헷갈리지 않게)', () => {
  assertEquals(intentNameOf('예약_확인'), '예약확인')
  assertEquals(intentNameOf('order_status'), 'orderstatus')
})

Deno.test('intentNameOf: 빈 입력은 빈 문자열', () => {
  assertEquals(intentNameOf(''), '')
  assertEquals(intentNameOf('   '), '')
})

Deno.test('intentNameOf: 허용 문자가 하나도 없으면 빈 문자열', () => {
  assertEquals(intentNameOf('///'), '')
  assertEquals(intentNameOf('!@#$'), '')
})

Deno.test('intentNameOf: null·undefined에서 던지지 않는다', () => {
  assertEquals(intentNameOf(null), '')
  assertEquals(intentNameOf(undefined), '')
})

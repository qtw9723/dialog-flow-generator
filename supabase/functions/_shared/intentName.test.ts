import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { intentNameOf, assignIntentNames } from "./intentName.ts"

Deno.test("intentNameOf: 공백을 제거한다(솔루션 인텐트명은 공백 없는 짧은 이름)", () => {
  assertEquals(intentNameOf("매장 예약"), "매장예약")
  assertEquals(intentNameOf("  배송 조회  "), "배송조회")
  assertEquals(intentNameOf("탭\t사이"), "탭사이")
})

Deno.test("intentNameOf: 빈 이름은 빈 문자열", () => {
  assertEquals(intentNameOf(""), "")
  assertEquals(intentNameOf("   "), "")
  assertEquals(intentNameOf(null as unknown as string), "")
})

Deno.test("assignIntentNames: 중복은 _2·_3을 붙인다(인텐트명은 유일해야 한다)", () => {
  assertEquals(assignIntentNames(["예약", "예약", "예약"]), ["예약", "예약_2", "예약_3"])
})

Deno.test("assignIntentNames: 공백만 다른 이름도 충돌로 본다(공백 제거 후 같아진다)", () => {
  assertEquals(assignIntentNames(["예약 하기", "예약하기"]), ["예약하기", "예약하기_2"])
})

Deno.test("assignIntentNames: 빈 이름은 자리를 유지한 채 빈 문자열로 남는다", () => {
  // 호출부가 빈 이름 인텐트를 버린다 — 여기서 인덱스를 흐트러뜨리면 시나리오 대응이 깨진다.
  assertEquals(assignIntentNames(["예약", "", "취소"]), ["예약", "", "취소"])
})

Deno.test("assignIntentNames: 원본 순서를 보존한다", () => {
  assertEquals(assignIntentNames(["배송 조회", "주문 취소"]), ["배송조회", "주문취소"])
})

// ── 특수문자 제거 (2026-08-28 사용자 지시) ──────────────────────────────

Deno.test("intentNameOf: 특수문자를 제거한다", () => {
  assertEquals(intentNameOf("예약 변경/취소"), "예약변경취소")
  assertEquals(intentNameOf("A/S 접수"), "AS접수")
  assertEquals(intentNameOf("환불(부분)"), "환불부분")
  assertEquals(intentNameOf("Q&A"), "QA")
  assertEquals(intentNameOf("주문·배송 조회"), "주문배송조회")
  assertEquals(intentNameOf("예약-확인"), "예약확인")
})

Deno.test("intentNameOf: 한글·영문·숫자는 남긴다", () => {
  assertEquals(intentNameOf("FAQ2"), "FAQ2")
  assertEquals(intentNameOf("매장정보"), "매장정보")
  assertEquals(intentNameOf("VIP 등급3 안내"), "VIP등급3안내")
})

Deno.test("intentNameOf: 밑줄도 제거한다(중복 접미사 _2와 헷갈리지 않게)", () => {
  // 입력에 _가 남으면 "예약_2"가 원본인지 중복 접미사인지 구분할 수 없다.
  assertEquals(intentNameOf("예약_확인"), "예약확인")
})

Deno.test("intentNameOf: 특수문자만 있으면 빈 문자열", () => {
  assertEquals(intentNameOf("///"), "")
  assertEquals(intentNameOf("!@#$"), "")
})

Deno.test("assignIntentNames: 특수문자 제거 후 같아지면 충돌로 본다", () => {
  assertEquals(assignIntentNames(["예약/확인", "예약 확인"]), ["예약확인", "예약확인_2"])
})

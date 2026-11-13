import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { undoTarget } from "./undoTarget.js"

// 안전 불변식: 화면에 미확정 편집이 떠 있는 동안에는 서버의 확정 이력에 손대지 않는다.
// (그러지 않으면 사용자는 "방금 한 편집"을 되돌린다고 생각하면서 무관한 과거 확정본을 날린다)

Deno.test("미확정 캔버스 편집이 있으면 그것부터 되돌린다 — 서버 이력은 건드리지 않음", () => {
  assertEquals(undoTarget({ hasPendingEdit: true, hasHistory: true }), 'pending')
})

Deno.test("이력이 없어도 미확정 편집은 되돌릴 수 있다", () => {
  assertEquals(undoTarget({ hasPendingEdit: true, hasHistory: false }), 'pending')
})

Deno.test("미확정 편집이 없을 때만 확정 이력을 롤백한다", () => {
  assertEquals(undoTarget({ hasPendingEdit: false, hasHistory: true }), 'history')
})

Deno.test("되돌릴 게 없으면 none — 버튼을 숨긴다", () => {
  assertEquals(undoTarget({ hasPendingEdit: false, hasHistory: false }), 'none')
})

Deno.test("인자 누락은 되돌릴 것 없음으로 취급", () => {
  assertEquals(undoTarget({}), 'none')
  assertEquals(undoTarget(), 'none')
})

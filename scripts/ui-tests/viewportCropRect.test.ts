import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { viewportCropRect } from "../../src/lib/captureViewport.js"

Deno.test("viewportCropRect: 스크롤 0·1배율 — 뷰포트 그대로", () => {
  const r = viewportCropRect({ scrollX: 0, scrollY: 0, innerWidth: 1200, innerHeight: 800, canvasWidth: 1200, canvasHeight: 3000, pageWidth: 1200 })
  assertEquals(r, { sx: 0, sy: 0, sw: 1200, sh: 800 })
})

Deno.test("viewportCropRect: 스크롤·2배율(레티나) 반영", () => {
  const r = viewportCropRect({ scrollX: 0, scrollY: 500, innerWidth: 1200, innerHeight: 800, canvasWidth: 2400, canvasHeight: 6000, pageWidth: 1200 })
  assertEquals(r, { sx: 0, sy: 1000, sw: 2400, sh: 1600 })
})

Deno.test("viewportCropRect: 캔버스 경계 클램프(페이지 끝 스크롤)", () => {
  const r = viewportCropRect({ scrollX: 0, scrollY: 2500, innerWidth: 1200, innerHeight: 800, canvasWidth: 1200, canvasHeight: 3000, pageWidth: 1200 })
  assertEquals(r.sy, 2500)
  assertEquals(r.sh, 500) // 3000-2500 — 넘치지 않게
})

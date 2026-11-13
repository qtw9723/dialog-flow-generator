import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { parseJpegDataUrl, screenshotObjectPath, isExpiredScreenshot, SCREENSHOT_RETENTION_DAYS } from "../_shared/screenshotStorage.ts"

// 1x1 JPEG의 유효 base64 (검증용 — 실제 픽셀 데이터 아님, 형식만 유효)
const B64 = "/9j/4AAQSkZJRg=="

Deno.test("parseJpegDataUrl: 유효한 JPEG data URL → base64 본문", () => {
  assertEquals(parseJpegDataUrl(`data:image/jpeg;base64,${B64}`), B64)
})

Deno.test("parseJpegDataUrl: 접두사 불일치·비문자열 → null", () => {
  assertEquals(parseJpegDataUrl("data:image/png;base64,AAAA"), null)
  assertEquals(parseJpegDataUrl("hello"), null)
  assertEquals(parseJpegDataUrl(undefined), null)
  assertEquals(parseJpegDataUrl(123), null)
})

Deno.test("parseJpegDataUrl: 본문 없음 → null", () => {
  assertEquals(parseJpegDataUrl("data:image/jpeg;base64,"), null)
})

Deno.test("screenshotObjectPath: dev/prod 접두사 분리", () => {
  assertEquals(screenshotObjectPath(true, "abc-123"), "dev/abc-123.jpg")
  assertEquals(screenshotObjectPath(false, "abc-123"), "prod/abc-123.jpg")
})

Deno.test("isExpiredScreenshot: 완료 + 보존기간 경과 + 경로 있음 → true", () => {
  const now = new Date("2026-07-08T00:00:00Z")
  const old = new Date(now.getTime() - (SCREENSHOT_RETENTION_DAYS + 1) * 86400_000).toISOString()
  assertEquals(isExpiredScreenshot({ completed: true, updated_at: old, screenshot_path: "dev/x.jpg" }, now), true)
})

Deno.test("isExpiredScreenshot: 미완료·기간 미달·경로 없음 → false", () => {
  const now = new Date("2026-07-08T00:00:00Z")
  const old = new Date(now.getTime() - (SCREENSHOT_RETENTION_DAYS + 1) * 86400_000).toISOString()
  const recent = new Date(now.getTime() - 86400_000).toISOString()
  assertEquals(isExpiredScreenshot({ completed: false, updated_at: old, screenshot_path: "dev/x.jpg" }, now), false)
  assertEquals(isExpiredScreenshot({ completed: true, updated_at: recent, screenshot_path: "dev/x.jpg" }, now), false)
  assertEquals(isExpiredScreenshot({ completed: true, updated_at: old, screenshot_path: null }, now), false)
})

Deno.test("isExpiredScreenshot: updated_at 파싱 불가 → false(안전측)", () => {
  const now = new Date("2026-07-08T00:00:00Z")
  assertEquals(isExpiredScreenshot({ completed: true, updated_at: "not-a-date", screenshot_path: "dev/x.jpg" }, now), false)
})

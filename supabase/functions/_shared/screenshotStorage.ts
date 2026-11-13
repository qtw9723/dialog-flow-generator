// 피드백 스크린샷 Storage 저장 — DB엔 경로만, 파일은 private 버킷(feedback-screenshots).
// 보존 정책: 완료(completed) 후 SCREENSHOT_RETENTION_DAYS 경과 시 객체 삭제(어드민 GET 때 lazy cleanup — 별도 cron 없음).

export const SCREENSHOT_BUCKET = "feedback-screenshots"
export const SCREENSHOT_RETENTION_DAYS = 7

const JPEG_PREFIX = "data:image/jpeg;base64,"

// JPEG data URL → base64 본문. 형식이 어긋나면 null(스크린샷만 무시 — best-effort).
export function parseJpegDataUrl(input: unknown): string | null {
  if (typeof input !== "string" || !input.startsWith(JPEG_PREFIX)) return null
  const body = input.slice(JPEG_PREFIX.length)
  return body.length > 0 ? body : null
}

// 버킷 내 객체 경로 — dev/prod를 접두사로 격리(버킷은 하나).
export function screenshotObjectPath(dev: boolean, id: string): string {
  return `${dev ? "dev" : "prod"}/${id}.jpg`
}

// 완료된 지 보존기간이 지난 스크린샷인지. updated_at은 완료 토글 시각(PATCH가 갱신).
export function isExpiredScreenshot(
  row: { completed?: boolean; updated_at?: string | null; screenshot_path?: string | null },
  now: Date,
): boolean {
  if (!row.completed || !row.screenshot_path || !row.updated_at) return false
  const t = Date.parse(row.updated_at)
  if (Number.isNaN(t)) return false
  return now.getTime() - t > SCREENSHOT_RETENTION_DAYS * 86400_000
}

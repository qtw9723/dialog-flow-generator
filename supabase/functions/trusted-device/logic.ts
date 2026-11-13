// 신뢰 기기 로그인의 순수 로직(네트워크/DB 없는 부분). index.ts에서 import해 사용하고,
// logic.test.ts에서 단위 테스트한다.

// 기기 토큰을 sha256 hex로 해시. DB에는 원본이 아닌 이 해시만 저장한다.
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// 신뢰 토큰 만료 기한(ISO). 기본 30일.
export function computeExpiry(nowMs: number, days = 30): string {
  return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString()
}

// 만료 여부.
export function isExpired(expiresAt: string, nowMs: number): boolean {
  const exp = Date.parse(expiresAt)
  return Number.isNaN(exp) || exp <= nowMs
}

// 이메일 일치(대소문자/공백 무시). 신뢰 기기 행의 소유자 이메일 == 입력 이메일 검증용.
export function emailsMatch(a: string, b: string): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase()
}

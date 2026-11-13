// 보관 표시 PATCH의 요청 검증만. serve() 밖에 두어 HTTP 없이 테스트한다.
//
// 이 함수가 통과시킨 뒤에야 소유권 조회(id + user_id)가 돌아간다 —
// 검증과 소유권은 별개의 방어선이다.

/** 문제가 있으면 사용자에게 보여줄 메시지를, 없으면 null을 돌려준다. */
export function validateArchived(body: unknown): string | null {
  const b = (body && typeof body === "object" ? body : {}) as { archived?: unknown }
  if (typeof b.archived !== "boolean") return "archived must be a boolean"
  return null
}

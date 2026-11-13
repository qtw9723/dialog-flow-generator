// DEV 테이블 모드 — "같은 Supabase에 dev용 테이블을 만들어 실행하다가, 검증 후 본 테이블로 머지" 정책.
// 함수가 `-dev` 슬러그(예: dialogflow-generator-dev)로 배포되면 요청 경로로 감지해
// questions/solution_rules/dialogflow_results를 dev_ 접두사 테이블로 바꿔 읽고 쓴다.
// 프로덕션 슬러그는 경로에 -dev가 없으므로 항상 본 테이블 그대로 — 코드가 main에 머지돼도 무해.

export function isDevRequest(url: string): boolean {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop() || ""
    return seg.endsWith("-dev")
  } catch {
    return false
  }
}

// 사용: const T = tablePicker(isDevRequest(req.url)); supabase.from(T("questions"))
export function tablePicker(dev: boolean): (name: string) => string {
  return (name: string) => (dev ? `dev_${name}` : name)
}

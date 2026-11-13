import { FlowSpec } from "./types.ts"

// FlowSpec에 LLM이 태깅한 scenarioName을 모아 결과 번들용 맵으로 만든다.
// 키는 머신 flow의 시나리오 루트(main.then) id — FlowSpec 노드 id가 그대로 머신 노드 id가 된다.
// generated_json에는 절대 싣지 않는다(솔루션 임포터가 미지 필드를 거부).

/**
 * @param inputNames 설문에서 받은 "시나리오 이름" 목록. 비어 있으면 mismatch 검사를 건너뛴다.
 */
export function collectScenarioNames(
  spec: FlowSpec,
  machineFlow: any,
  inputNames: string[],
): { scenarios: Record<string, string>; mismatch: string[] } {
  const main = (machineFlow?.dialogs || []).find((d: any) => d?.id === "main")
  const rootIds = new Set<string>((main?.then || []) as string[])

  const scenarios: Record<string, string> = {}
  for (const n of (spec?.nodes || []) as any[]) {
    const name = String(n?.scenarioName || "").trim()
    if (!name || !rootIds.has(n.id)) continue
    scenarios[n.id] = name
  }

  // 입력 이름이 있는데 LLM이 다른 이름을 지어냈으면 기록만 한다(교정하지 않음 — 생성 무해성 우선).
  const mismatch: string[] = []
  if (inputNames.length) {
    const allowed = new Set(inputNames.map((s) => String(s || "").trim()).filter(Boolean))
    for (const [id, name] of Object.entries(scenarios)) {
      if (!allowed.has(name)) mismatch.push(`${id}: 태깅된 이름 "${name}"이 입력 시나리오 이름에 없음`)
    }
  }
  return { scenarios, mismatch }
}

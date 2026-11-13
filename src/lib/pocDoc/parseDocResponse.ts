import type { Extracted, ExtractedScenario, ExtractedIntegration } from "./assembleResponses.ts"

/**
 * Normalizes a raw LLM response string into the Extracted structure.
 * Never throws — broken/partial/empty input → safe empty/partial output.
 * Missing fields are left undefined (no fabrication).
 */
export function normalizeExtracted(raw: string): Extracted {
  if (!raw || typeof raw !== "string") return { scenarios: [] }

  let parsed: unknown
  try {
    // Strip optional markdown code block wrapper (```json ... ``` or ``` ... ```)
    const stripped = raw.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
    parsed = JSON.parse(stripped)
  } catch {
    return { scenarios: [] }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { scenarios: [] }
  }

  const obj = parsed as Record<string, unknown>
  const result: Extracted = { scenarios: [] }

  if (typeof obj.botName === "string" && obj.botName !== "") {
    result.botName = obj.botName
  }
  if (typeof obj.personality === "string" && obj.personality !== "") {
    result.personality = obj.personality
  }

  if (Array.isArray(obj.scenarios)) {
    result.scenarios = obj.scenarios.map((s): ExtractedScenario => {
      if (!s || typeof s !== "object" || Array.isArray(s)) return {}
      const sc = s as Record<string, unknown>
      const scenario: ExtractedScenario = {}
      if (typeof sc.name === "string") scenario.name = sc.name
      if (typeof sc.trigger === "string") scenario.trigger = sc.trigger
      if (typeof sc.done === "string") scenario.done = sc.done
      if (Array.isArray(sc.collect)) {
        scenario.collect = sc.collect
          .filter((i) => typeof i === "string")
          .map((i) => i as string)
      }
      if (Array.isArray(sc.branches) && sc.branches.length > 0) {
        scenario.branches = sc.branches
      }
      if (Array.isArray(sc.integrations)) {
        const integrations = sc.integrations
          .map((raw): ExtractedIntegration | null => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
            const it = raw as Record<string, unknown>
            // purpose 없으면 폐기 — 쓰레기 ESD 노드 방지.
            if (typeof it.purpose !== "string" || it.purpose.trim() === "") return null
            const norm: ExtractedIntegration = { purpose: it.purpose }
            if (Array.isArray(it.send)) {
              norm.send = it.send.filter((s): s is string => typeof s === "string")
            }
            if (typeof it.resultName === "string" && it.resultName !== "") {
              norm.resultName = it.resultName
            }
            return norm
          })
          .filter((i): i is ExtractedIntegration => i !== null)
        if (integrations.length > 0) scenario.integrations = integrations
      }
      return scenario
    })
  }

  return result
}

/**
 * Returns the extraction prompt to send to the LLM.
 * Schema is embedded verbatim so the LLM knows exactly what shape to return.
 */
export function buildExtractionPrompt(
  text: string,
  options?: { layoutGuide?: string; confirmedColumns?: string },
): string {
  // 열 인식 지침은 더 이상 여기 하드코딩하지 않는다 — DB(solution_rules의
  // 'Document Term Mapping')가 단일 소스이고, 호출부가 렌더해 넘긴다.
  // 코드와 DB 두 벌로 두면 이 저장소가 늘 그랬듯 갈라진다.
  const sections = [
    (options?.layoutGuide ?? "").trim(),
    (options?.confirmedColumns ?? "").trim(),
  ].filter((s) => s !== "").join("\n\n")

  return `당신은 챗봇 기획 정보를 구조화해 추출하는 분석가입니다.
입력은 (a) 조직마다 열 구성이 다른 Step 표·정의서 같은 문서일 수도, (b) "배송 조회하고 주문 취소도 되는 상담봇"처럼 자유롭게 쓴 자연어 설명일 수도 있습니다. 어느 형식이든 정보를 추출해 다음 JSON 스키마로만 응답하세요. 확신 없는 항목은 키를 생략하세요(날조 금지).

[자연어 설명 인식 지침]
입력이 표가 아니라 서술형 문장이어도 반드시 시나리오를 추출하세요. 한 문장에 여러 기능이 나열되면 각 기능을 개별 시나리오로 나눕니다.
- 예: "배송 조회하고 주문 취소도 되는 상담봇, 배송은 송장번호 받아서 조회"
  → botName "상담봇", scenarios [{name:"배송 조회", trigger:"배송 조회", collect:["송장번호"]}, {name:"주문 취소", trigger:"주문 취소"}]
- 기능이 정말 하나도 언급되지 않았을 때만 scenarios를 빈 배열로 두세요.

[ESD 연동(데이터 저장·조회) 인식 지침]
입력에 데이터 저장·조회·"ESD"·"내부 데이터" 같은 서술이 있으면, 그 데이터가 실제로 쓰이는 **시나리오별로** integrations 항목을 채우세요.
- "모든 데이터는 ESD 기반/저장" 같은 전역 서술은 그 자체로 시나리오가 아니라, **각 기능 시나리오의 integrations로 반영**합니다. 어느 시나리오에 붙일지는 문맥으로 판단하세요 — 실제로 데이터를 저장·조회하는 기능에만 붙이고, 필요 없는 시나리오는 integrations를 비웁니다(무조건 전부 붙이지 말 것).
- integrations 각 항목:
  - purpose: 이 연동이 무엇을 하는지 한 줄. 조회면 "…조회", 저장이면 "…저장"으로 의도가 드러나게. (필수)
  - send: 이 연동에 넘길 수집 항목명 배열(그 시나리오 collect에서). 없으면 생략.
  - resultName: 조회 결과를 담을 변수명(한글 가능). 저장만 하면 생략 가능.
- 예: "배송 조회하고 주문 취소도 되는 상담봇, 배송은 송장번호 받아서 조회, 모든 데이터는 ESD를 기반으로 사용"
  → scenarios[0] {name:"배송 조회", trigger:"배송 조회", collect:["송장번호"], integrations:[{purpose:"배송 정보 조회", send:["송장번호"], resultName:"배송정보"}]}
  → scenarios[1] {name:"주문 취소", trigger:"주문 취소", integrations:[{purpose:"주문 취소 정보 저장", send:["주문번호"]}]}
- 데이터 저장·조회가 필요 없는 시나리오는 integrations를 넣지 마세요(빈 배열 또는 생략).
${sections ? `\n${sections}\n` : ""}
응답 형식 (JSON만, 마크다운 코드블록 없이):
{
  "botName": "챗봇 이름",
  "personality": "챗봇 말투·성격 설명",
  "scenarios": [
    {
      "name": "시나리오 이름",
      "trigger": "이 시나리오를 시작하는 사용자 발화",
      "collect": ["수집 항목명1", "수집 항목명2"],
      "done": "시나리오 완료 시 결과 또는 처리 내용",
      "branches": [],
      "integrations": [
        { "purpose": "데이터 조회/저장 목적", "send": ["수집 항목명1"], "resultName": "결과 변수명" }
      ]
    }
  ]
}

규칙:
- collect는 항목 이름 문자열 배열(설명이 아닌 이름만)
- integrations는 ESD 데이터 저장·조회 연동 배열. 데이터 처리가 없는 시나리오는 빈 배열 또는 생략(위 [ESD 연동 인식 지침] 참고)
- collect 항목이 기술 식별자(예: fname, pc_catid, DOB)와 사용자 친화 라벨(예: 이름, 진료 항목, 생년월일)을 함께 가지면, API 필드 코드가 아니라 봇이 사용자에게 묻는 한글 사용자 라벨을 쓰세요
- 확신 없는 필드는 포함하지 마세요(날조 금지)
- scenarios는 반드시 배열이어야 합니다(기능이 하나도 언급되지 않았을 때만 빈 배열 [])
- JSON만 반환, 다른 텍스트 없음

입력:
${text}`
}

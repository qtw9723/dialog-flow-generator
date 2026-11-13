// LLM-구동 플로우 체인(수집형 LLM 시나리오 전용 규격 — 2026-07-03 설계).
// 수집 항목마다 [기본 응답 output → 수집 판정 llmchat] 쌍을 then으로 잇는다.
// llmchat은 올바른 값이 나오면 save_{변수명} tool로 분기(body: 저장 set + _llm.terminate)해
// 다음 단계로 넘어가고, 아니면 terminate가 없어 자연 반복(재요청)한다.
// 레퍼런스 전례: 샘플 봇의 "output 안내 → llmchat 판정" + tool 핸들러 body 패턴.

export interface CollectItem {
  label: string      // 항목명(사람용) — 멘트·프롬프트에 사용
  varName: string    // 변수명 — 툴 이름·local 변수에 사용(비면 item{k})
  required: boolean  // 필수=값 받을 때까지 반복 / 선택=빈 값 호출 허용
  format: string     // 입력 형식(자유텍스트/숫자/날짜/전화번호/이메일/시간/기타)
  reask: string      // "없을 때 되묻는 말" — 기본 응답 멘트로 우선 사용
}

export interface ChainOptions {
  botName: string
  tone: string
  scenarioName: string
  result: string     // "완료 시 결과" — 비면 기본 완료 멘트 생성
  prefix: string     // 노드 id 접두(예: llmflow1)
}

// 형식별 프롬프트/툴 설명 힌트 — LLM 판정으로 옮겨진 형식 검증의 기준.
const FORMAT_HINTS: Record<string, string> = {
  "전화번호": "010-1234-5678 같은 전화번호 형식",
  "이메일": "name@example.com 같은 이메일 형식",
  "숫자": "숫자만",
  "날짜": "2026-07-03 같은 날짜",
  "시간": "14:30 같은 시간",
}

function formatHint(format: string): string {
  return FORMAT_HINTS[format] || (format && format !== "자유텍스트" ? format : "형식 제약 없음")
}

function makeAskOutput(id: string, item: CollectItem, nextId: string): any {
  const text = (item.reask || "").trim() || `${item.label}을(를) 알려주시겠어요?`
  return {
    id, type: "output", label: `${item.label} 요청`, body: [], then: [nextId], actions: [], condition: "",
    config: {
      items: [
        {
          data: "",
          type: "text",
          text: [{ texts: [text], condition: "" }],
          channels: [{ name: "Web", use: true }],
          condition: "",
        },
      ],
      hideInput: false,
      waitInput: false,
    },
  }
}

function makeCollectPrompt(item: CollectItem, varName: string, opts: ChainOptions): string {
  const hint = formatHint(item.format)
  return [
    "## 챗봇 성향",
    `- 너는 "${opts.botName || "챗봇"}"의 상담원이다.${opts.tone ? ` 말투: ${opts.tone}.` : ""}`,
    "",
    "## 임무",
    `- 시나리오 "${opts.scenarioName}" 진행 중이다. 방금 사용자에게 "${item.label}"을(를) 요청했다.`,
    `- 사용자 답변에서 ${item.label}을(를) 확인하라. 입력 형식: ${hint}.`,
    `- 올바른 값이면 다른 말 없이 save_${varName} 도구를 그 값과 함께 호출한다.`,
    `- 값이 아니면(질문·다른 얘기·형식 불일치) 상황에 맞게 짧게 답하고, 다시 정중히 ${item.label}을(를) 요청한다.`,
    item.required
      ? `- ${item.label}은(는) 필수다. 값을 받을 때까지 반복해서 요청한다.`
      : `- ${item.label}은(는) 선택이다. 사용자가 제공을 원치 않으면 빈 값("")으로 save_${varName}를 호출하고 넘어간다.`,
    "- 답변은 한국어로 간결하게 한다.",
  ].join("\n")
}

function makeCollectTool(item: CollectItem, varName: string): string {
  const hint = formatHint(item.format)
  return JSON.stringify([
    {
      name: `save_${varName}`,
      description: `사용자가 제공한 ${item.label} 값을 저장한다.`,
      parameters: {
        type: "object",
        properties: { [varName]: { type: "string", description: `${item.label}(${hint})` } },
        required: [varName],
      },
    },
  ], null, 2)
}

// 체인 생성. 반환: entryId(첫 기본 응답 output) + 전체 노드(평면 — dialog.nodes에 추가용).
export function buildLlmFlowChain(items: CollectItem[], opts: ChainOptions): { entryId: string; nodes: any[] } {
  const nodes: any[] = []
  const doneId = `${opts.prefix}_done`
  let entryId = doneId

  // 뒤에서부터 연결(각 단계의 then이 다음 단계 id를 가리켜야 하므로).
  let nextId = doneId
  for (let k = items.length; k >= 1; k--) {
    const item = items[k - 1]
    const varName = (item.varName || "").trim() || `item${k}`
    const askId = `${opts.prefix}_s${k}_ask`
    const llmId = `${opts.prefix}_s${k}_llm`
    const handlerId = `${opts.prefix}_s${k}_h`
    const setId = `${opts.prefix}_s${k}_set`

    nodes.unshift(
      makeAskOutput(askId, item, llmId),
      {
        id: llmId, type: "llmchat", label: `${item.label} 수집`, body: [handlerId], then: [nextId],
        actions: [], condition: "",
        config: {
          tool: makeCollectTool(item, varName),
          type: "openai", model: "", apiKey: "",
          prompt: "`" + makeCollectPrompt(item, varName, opts) + "`",
          stream: true, history: "2",
        },
      },
      {
        id: handlerId, type: "node", label: `${item.label} 저장 분기`, body: [], then: [setId], actions: [],
        condition: `_llm.tool.name == "save_${varName}"`, config: { auth: false },
      },
      {
        id: setId, type: "set", label: `${item.label} 저장`, body: [], then: [], actions: [], condition: "",
        config: {
          items: [
            { key: `local.${varName}`, value: `_llm.tool.args.${varName}`, condition: "" },
            { key: "_llm.terminate", value: "true", condition: "" },
          ],
        },
      },
    )
    entryId = askId
    nextId = askId
  }

  // 완료 output — "완료 시 결과"가 비면 기본 멘트.
  const doneText = (opts.result || "").trim() || "요청이 접수되었습니다. 감사합니다!"
  nodes.push({
    id: doneId, type: "output", label: "완료 멘트", body: [], then: [], actions: [], condition: "",
    config: {
      items: [
        {
          data: "",
          type: "text",
          text: [{ texts: [doneText], condition: "" }],
          channels: [{ name: "Web", use: true }],
          condition: "",
        },
      ],
      hideInput: false,
      waitInput: false,
    },
  })

  return { entryId, nodes }
}

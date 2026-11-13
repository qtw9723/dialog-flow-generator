import { ExtractResult } from "./types.ts"

export function buildGeneralizePrompt(extract: ExtractResult, descriptionsByType: Record<string, string>): string {
  const renderFields = (fields: Record<string, any>, indent: string) =>
    Object.entries(fields).map(([path, f]) =>
      `${indent}${path} : types=${f.types.join("/")} values=${JSON.stringify(f.values.slice(0, 8))}`).join("\n")

  const blocks = Object.entries(extract).map(([type, ext]) => {
    const fieldLines = renderFields(ext.fields, "    ")
    // 판별 유니온 배열: type별(variant) 구조를 따로 제시
    const arrayLines = Object.entries(ext.arrays || {}).map(([path, da]: [string, any]) => {
      const vlines = Object.entries(da.variants).map(([tv, vs]: [string, any]) =>
        `      [${da.discriminator}=${tv}]\n${renderFields(vs.fields, "        ")}`).join("\n")
      return `    ${path} (판별 유니온 배열, ${da.discriminator}별로 구조 다름):\n${vlines}`
    }).join("\n")
    const body = [fieldLines, arrayLines].filter(Boolean).join("\n")
    return `노드 type "${type}" (관측 ${ext.count}건)${descriptionsByType[type] ? ` — ${descriptionsByType[type]}` : ""}\n${body}`
  }).join("\n\n")

  return `너는 챗봇 솔루션의 노드 빌드 스펙 작성자다. 아래는 실제 레퍼런스에서 노드 종류별로 추출한 필드·등장값이다.
각 노드 type에 대해 생성용 스펙을 JSON 배열로 출력하라.

[추출 데이터]
${blocks}

[출력 형식 — 이 JSON 배열만 출력]
[
  {
    "type": "<노드 type>",
    "summary": "<이 노드가 하는 일 한 줄 — 설명을 요약>",
    "isTerminal": <대화를 끝낼 수 있으면 true (output/agent류)>,
    "example": <대표 노드 골격. 채울 자리는 "{{슬롯명}}" placeholder>,
    "slots": [
      { "path": "<JSON path, 배열은 []>",
        "kind": "string|enum|boolean|number|array<string>|auto-id",
        "options": ["<enum일 때 허용값>"],
        "required": <bool>,
        "default": <기본값>,
        "source": "intent|response|user-input|auto-id|fixed|system",
        "note": "<이 자리를 채울 때 지켜야 할 규칙 한 줄(설명에서 도출)>" }
    ]
  }
]

[source 의미]
- intent: LLM이 설계한 노드 의도/시나리오에서 채움 (예: 발화 문구, label)
- response: 사용자 질문지 응답에서 채움
- user-input: 운영자가 직접 골라야 하는 값 (설명에 "사용자가 직접 입력/선택" 류가 있으면)
- auto-id: 시스템이 자동 생성하는 id
- fixed: 항상 같은 고정값(보일러플레이트) — 이 경우 슬롯 대신 example에 박는 걸 우선
- system: 솔루션이 런타임에 채우는 값(예: _result, _error)

[판별 유니온 배열 슬롯]
"(판별 유니온 배열)"로 표시된 배열(예: output의 config.items)은 type별로 모양이 다르다. 이 배열은 아래 형태의 슬롯으로 만든다:
{ "path": "config.items", "kind": "array<variant>", "discriminator": "type", "required": true,
  "variants": {
    "text":  { "example": {"type":"text","text":[{"texts":["{{text}}"]}],...고정값...}, "slots": [{"path":"text[].texts","kind":"array<string>","source":"intent"}] },
    "image": { "example": {"type":"image","url":"{{url}}","width":300,...}, "slots": [{"path":"url","source":"response","note":"이미지 URL"}] }
    // ...위 추출에 등장한 type만. 각 variant의 example/slots/enum은 그 variant 데이터 안에서만.
  } }
- variants 키는 위 추출의 [type=...]에 나온 값만 쓴다. 각 variant의 example은 그 type 인스턴스 골격(채울 자리는 {{...}}).

[중요 규칙]
- enum의 options와 example의 고정값은 **반드시 위 추출 데이터의 values 안에서만** 쓴다. 레퍼런스에 없는 값을 지어내지 마라.
- slots의 path는 위 추출된 path 중에서만 쓴다.
- **슬롯 선정**: 시나리오/사용자마다 달라지거나 운영자가 설정해야 하는 자리를 슬롯으로 만든다. **인스턴스가 1건뿐이어도, 설명상 설정/입력 대상이면 반드시 슬롯으로** 만들어라(예: llmchat의 config.prompt·config.tool·config.apiKey, agent의 config.counselor, api의 요청 설정). 변하지 않더라도 "사용자가 채워야 하는 값"이면 슬롯이다.
- 진짜 항상 같은 보일러플레이트(예: channels 구조, 고정 플래그)만 example에 고정값으로 둔다.
- **각 노드의 설명(— 뒤 텍스트)을 활용해 슬롯의 source·default·required·note를 정하라.** 설명에 담긴 사용 규칙을 슬롯에 반영한다. 예:
  · 설명에 "키는 비워둔다" → 해당 key 슬롯 default "" + note "사용자가 직접 입력하도록 비워둠"
  · 설명에 "카테고리는 미리 설정된 값을 사용자가 직접 입력" → source "user-input" + note 기재
  · 설명에 "결과는 _result로 반환" → 결과 관련 자리는 source "system"
- note는 그 자리를 채우는 사람/로직이 알아야 할 핵심 규칙만 간결히.`
}

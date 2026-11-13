import { NodeCatalogEntry } from "./types.ts"
import { renderEsdContract } from "./esdContract.ts"

export function buildFlowPrompt(
  responsesByRole: Record<string, any>,
  catalog: NodeCatalogEntry[],
  ruleSummary: string,
  examples = "",
  esdBundle?: any,
): string {
  const catalogText = catalog
    .map((c) => {
      const variants = c.variantTypes && c.variantTypes.length
        ? ` [item 선택지: ${c.variantTypes.join("/")}]` : ""
      return `- ${c.type} (${c.label}): ${c.description} ${c.promptInstruction}${c.isTerminal ? " [종결 가능]" : ""}${variants}`
    })
    .join("\n")

  const exampleSection = examples
    ? `\n[참고 예시 시나리오 — 같은 산업군의 구조 참고용. 그대로 복사하지 말고 사용자 입력에 맞게 설계하라]\n${examples}\n`
    : ""
  const esdSection = esdBundle ? `\n${renderEsdContract(esdBundle)}\n` : ""

  return `너는 챗봇 시나리오 플로우 설계자다. 아래 정보를 바탕으로 대화 플로우를 **추상 노드 그래프**로 설계하라.

[사용 가능한 노드 종류 (이 목록의 type만 사용)]
${catalogText}

[솔루션 규칙 — 반드시 준수]
${ruleSummary}
${exampleSection}${esdSection}
[사용자 질문지 응답]
${JSON.stringify(responsesByRole, null, 2)}

[응답 해석·설계 지침]
- 응답은 역할별로 묶여 있다:
  - intent: 봇의 목적/성공 조건 — 플로우 전체의 목표로 삼는다.
  - preference: 봇의 말투 — 각 노드 intent의 어조에 반영한다.
  - constraint: 금지 사항 — 어떤 노드도 이를 위반하지 않도록 설계한다(반드시 준수).
  - required_context의 "시나리오 입력": 각 시나리오 항목 = 하나의 대화 갈래다.

[플로우 구조 — 매우 중요 (next 연결로 트리가 결정된다)]
- **greeting**는 최상위(루트)이며, 그 아래엔 인사말 output **하나만** 둔다. greeting 아래에 시나리오를 연결하지 마라.
- **각 시나리오는 greeting과 같은 최상위(루트)**로 둔다. 즉 시나리오의 진입점 노드는 다른 어떤 노드의 next로도 참조되면 안 된다(greeting이나 공통 분기 노드 아래에 넣지 마라). 시나리오들끼리, 그리고 greeting과 형제다.
- 각 시나리오의 진입점은 그 시나리오의 **첫 기능 노드**(보통 첫 안내·입력요청 output)이며 진입 발화로 트리거된다(트리거 조건은 이후 단계가 채운다). **"○○ 시나리오 시작" 같은 아무 일도 안 하는 진입 전용 노드를 따로 만들지 마라** — 첫 기능 노드가 곧 진입점이다.
- **"사용자 발화에 따라 분기"하는 단일 공통 분기 노드를 만들지 마라.** 각 시나리오가 독립 루트다.
- 한 시나리오 내부의 단계들은 next로 이어 한 갈래를 만든다. 시나리오 안에서 갈래가 갈리는 곳(예: 조회 성공/실패)에만 분기(node)를 쓴다.
- 시나리오 진입 노드(각 시나리오의 첫 노드)에는 "scenarioName" 필드로 그 시나리오의 이름을 붙여라.
  · 입력에 "시나리오 이름"이 주어졌으면 **그 값을 토씨 하나 바꾸지 말고 그대로** 쓴다. 요약·의역·재작명 금지.
  · 입력에 이름이 없을 때만 2~6자 내외의 짧은 명사구로 직접 지어라(예: "배송 조회", "주문 취소").
  · 진입 노드가 아닌 노드에는 이 필드를 붙이지 마라.

[output·set 규칙 — DialogFlow 동작 (반드시 준수)]
- 모든 output 노드는 메시지를 보낸 뒤 **사용자 입력을 기다린다**. 따라서 단순 안내(예: "진료 예약을 시작합니다")만 하는 output을 따로 만들지 말고, **바로 다음 입력 요청과 하나의 output으로 합쳐라**(예: "진료 예약을 시작합니다. 이름을 알려주세요").
- 사용자에게서 정보를 입력받는 output **다음에는 반드시 set 노드**를 둬서 그 입력을 변수에 저장한다(이후 단계에서 사용). 입력 항목마다: output(요청) → set(저장) 순서로.
- group 노드는 시각적 구분이 꼭 필요할 때만(남발 금지). 같은 일을 하는 노드를 중복 생성하지 마라.

[외부 연동 노드 선택]
- 외부 연동 항목의 **"연동 방식"** 값을 따른다: "외부 시스템 호출 (API)"이면 \`api\` 노드, "내부 데이터 저장·조회 (ESD)"이면 \`esd\` 노드를 쓴다.
- "연동 방식"이 비어 있으면 "연동 목적" 문구로 판단한다("저장/조회"=esd, "호출/연동"=api).

[반복 루프(loop) 설계 — 같은 구간을 조건 충족까지 반복할 때만]
- 반복이 필요하면 **\`type:"loop"\` 노드 + \`loop\` 객체**를 쓴다. **\`subflow\`라는 type을 쓰지 마라**(카탈로그에 없다). 반복을 next로 다시 본문 첫 노드를 가리키는 **순환으로 만들지 마라**(루프백 금지) — 반복은 loop 노드가 자동 처리한다.
- \`loop.body\` = 반복 본문의 **첫 노드 id**. 본문 노드들은 nodes[]에 일반 노드로 두고 next로 한 번 흐르게 잇는다(본문 끝에서 다시 처음으로 잇지 않는다).
- \`loop.exitVar\` = 탈출 flag 변수. **\`context.\` 네임스페이스**를 쓴다(예: \`context.done\`).
- 본문 흐름 안에, 종료 조건이 충족됐을 때(예: 사용자가 "그만") **set 노드로 그 exitVar를 켜는 노드를 반드시 둔다**(없으면 영원히 반복). 보통 본문 안 condition 분기의 한쪽에 set을 놓는다.
- \`loop.next\` = 루프를 빠져나온 뒤 이어질 노드. \`loop.max\` = 안전 최대 반복(예: 10).

[출력 형식 — 아래 JSON 스키마만 출력]
{
  "version": "1",
  "entry": "<시작 노드 id>",
  "nodes": [
    { "id": "n1", "type": "<카탈로그의 노드 종류>", "intent": "<이 노드가 할 일 한 줄>", "next": ["<다음 노드 id>"],
      "variants": ["<[item 선택지]가 있는 노드만: 이 노드에 넣을 item type들>"] },
    { "id": "n2", "type": "<카탈로그의 노드 종류>", "intent": "<이 시나리오의 첫 노드일 때>", "next": ["<다음 노드 id>"],
      "scenarioName": "<시나리오 진입 노드에만 붙인다. 그 외 노드는 이 필드를 아예 넣지 마라>" },
    { "id": "loop1", "type": "loop", "intent": "<반복할 구간의 목적>", "next": ["<루프 탈출 후 이어질 노드 id>"],
      "loop": { "body": ["<반복 본문의 첫 노드 id>"], "exitVar": "context.<flag>", "max": 10 } }
  ]
}

[중요 규칙]
- 노드의 종류·순서·분기·의도만 설계한다. **각 노드의 상세 필드값은 만들지 마라**(이후 단계가 규칙대로 채운다).
- 모든 경로는 [종결 가능] 표시된 노드(예: output)로 끝나야 한다.
- type은 위 카탈로그의 type 값(괄호 앞)만 쓴다.
- **[item 선택지]가 표시된 노드(예: output)는 의도에 맞게 \`variants\`에 1개 이상 고른다**(예: 단순 안내=["text"], 이미지+설명=["text","image"], 목록형=["carousel"]). 선택지는 그 노드의 목록에 있는 값만. 선택지 없는 노드는 variants 생략.`
}

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildLlmFlowChain } from "./llmFlowChain.ts"

const ITEMS = [
  { label: "이름", varName: "name", required: true, format: "자유텍스트", reask: "" },
  { label: "연락처", varName: "phone", required: false, format: "전화번호", reask: "연락처를 알려주시겠어요?" },
]
const OPTS = { botName: "검증봇", tone: "친근한 존댓말", scenarioName: "상담 예약", result: "상담 예약이 완료되었습니다.", prefix: "llmflow1" }

Deno.test("체인 구조: 항목마다 [기본 응답 output → 수집 llmchat] 쌍이 then으로 이어진다", () => {
  const { entryId, nodes } = buildLlmFlowChain(ITEMS, OPTS)
  const byId = new Map(nodes.map((n: any) => [n.id, n]))
  // 진입: 첫 항목의 기본 응답 output
  const ask1 = byId.get(entryId)
  assertEquals(ask1.type, "output")
  assert(JSON.stringify(ask1.config).includes("이름"))   // 기본형 질문 멘트
  const llm1 = byId.get(ask1.then[0])
  assertEquals(llm1.type, "llmchat")
  // 다음 단계: 연락처 기본 응답(되묻는 말 사용) → llmchat
  const ask2 = byId.get(llm1.then[0])
  assertEquals(ask2.type, "output")
  assert(JSON.stringify(ask2.config).includes("연락처를 알려주시겠어요?"))  // reask 우선
  const llm2 = byId.get(ask2.then[0])
  assertEquals(llm2.type, "llmchat")
  // 마지막: 완료 output(완료 시 결과)
  const done = byId.get(llm2.then[0])
  assertEquals(done.type, "output")
  assert(JSON.stringify(done.config).includes("상담 예약이 완료되었습니다."))
  assertEquals(done.then, [])
})

Deno.test("수집 llmchat: save 툴 + body(핸들러→저장·terminate set) + 판정 prompt", () => {
  const { entryId, nodes } = buildLlmFlowChain(ITEMS, OPTS)
  const byId = new Map(nodes.map((n: any) => [n.id, n]))
  const llm1 = byId.get(byId.get(entryId).then[0])
  const c = llm1.config
  // 툴: save_name 하나(지식소스 툴 없음)
  assert(c.tool.includes("save_name"))
  assert(!c.tool.includes("ask_docs"))
  // 키·모델은 빈 값(불변식)
  assertEquals(c.apiKey, "")
  assertEquals(c.model, "")
  // body: 핸들러 node(cond tool==save_name) → set(local.name 저장 + terminate)
  assertEquals(llm1.body.length, 1)
  const h = byId.get(llm1.body[0])
  assertEquals(h.type, "node")
  assertEquals(h.condition, '_llm.tool.name == "save_name"')
  const s = byId.get(h.then[0])
  assertEquals(s.type, "set")
  assert(s.config.items.some((i: any) => i.key === "local.name" && i.value === "_llm.tool.args.name"))
  assert(s.config.items.some((i: any) => i.key === "_llm.terminate" && i.value === "true"))
  // prompt: 임무(항목 확인)·재요청·필수 반복 지침
  const p = c.prompt
  assert(p.includes("이름"))
  assert(p.includes("save_name"))
  assert(p.includes("다시"))          // 재요청
  assert(p.includes("반복"))          // 필수=값 받을 때까지
})

Deno.test("선택 항목: 원치 않으면 빈 값 호출 허용 지침, 필수 항목: 반복 지침", () => {
  const { nodes } = buildLlmFlowChain(ITEMS, OPTS)
  const llms = nodes.filter((n: any) => n.type === "llmchat")
  assert(llms[0].config.prompt.includes("반복"))            // name=필수
  assert(llms[1].config.prompt.includes("빈 값"))           // phone=선택
})

Deno.test("입력 형식이 prompt와 tool 인자 설명에 반영된다(전화번호)", () => {
  const { nodes } = buildLlmFlowChain(ITEMS, OPTS)
  const llm2 = nodes.filter((n: any) => n.type === "llmchat")[1]
  assert(llm2.config.prompt.includes("전화번호"))
  assert(llm2.config.tool.includes("전화번호"))
})

Deno.test("변수명이 비어 있으면 item{k}로 대체해 툴 이름을 만든다", () => {
  const { nodes } = buildLlmFlowChain([{ label: "메모", varName: "", required: true, format: "자유텍스트", reask: "" }], OPTS)
  const llm = nodes.find((n: any) => n.type === "llmchat")
  assert(llm.config.tool.includes("save_item1"))
})

Deno.test("완료 멘트가 없으면 기본 완료 output을 생성한다", () => {
  const { nodes } = buildLlmFlowChain(ITEMS, { ...OPTS, result: "" })
  const outs = nodes.filter((n: any) => n.type === "output")
  const done = outs[outs.length - 1]
  assert(JSON.stringify(done.config).includes("접수되었습니다"))
})

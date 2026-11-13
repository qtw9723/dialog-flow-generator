import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildVarFormatMap, wrapValidationLoops, resolveLoopRule, DEFAULT_LOOP_RULE } from "./wrapValidationLoops.ts"
import { DEFAULT_LOOP_BEHAVIOR } from "./loopBehavior.ts"

const rule = {
  maxCount: 3,
  formats: { "숫자": "^[0-9-]+$", "날짜": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
  onExhaust: "continue",
}

// materialized generatedJson 골격: main dialog만 의미. ask(output) → set → done(output)
function makeJson() {
  return {
    dialogs: [
      { id: "predialog", nodes: [] },
      {
        id: "main",
        then: ["ask_phone", "fallback"],
        nodes: [
          {
            id: "ask_phone", type: "output", label: "전화번호 요청", then: ["set_phone"],
            config: { items: [{ type: "text", text: [{ condition: "", texts: ["전화번호를 알려주세요."] }] }] },
          },
          {
            id: "set_phone", type: "set", label: "전화번호 저장", then: ["done"],
            config: { items: [{ key: "_user.phone", value: "input.text", condition: "" }] },
          },
          { id: "done", type: "output", label: "완료", then: [], config: { items: [{ type: "text", text: [{ condition: "", texts: ["완료"] }] }] } },
          { id: "fallback", type: "fallback", then: [] },
        ],
      },
      { id: "postdialog", nodes: [] },
    ],
  }
}

const mainOf = (j: any) => j.dialogs.find((d: any) => d.id === "main")
const nodeById = (j: any, id: string) => mainOf(j).nodes.find((n: any) => n.id === id)

Deno.test("숫자 항목이 subflow로 감싸진다 — 조건은 boolean 변수, match는 set 노드에서", () => {
  const j = makeJson()
  const res = wrapValidationLoops(j, { phone: { format: "숫자" } }, rule)
  assertEquals(res.wrapped, 1)
  const sub = mainOf(j).nodes.find((n: any) => n.type === "subflow")
  assert(sub, "subflow 노드가 생성돼야 함")
  assertEquals(sub.body, ["ask_phone"])                       // 본문 = 요청 output
  assertEquals(sub.then, ["done"])                            // 탈출 후 continuation
  // 루프 조건은 match()가 아니라 boolean flag(다른 루프와 동일 규약). 기본 behavior=truthy → flag 그대로.
  assertEquals(sub.config.loop.condition, "context.phoneValid")
  assertEquals(sub.config.loop.count, "3")

  // 검증 set 노드가 본문 끝(set 저장 다음)에 추가된다 — match는 여기서 평가해 boolean으로 저장.
  const validSet = nodeById(j, "set_phone__valid")
  assert(validSet, "검증 set 노드(set_phone__valid)가 있어야 함")
  assertEquals(validSet.type, "set")
  assertEquals(validSet.config.items[0].key, "context.phoneValid")
  assertEquals(validSet.config.items[0].value, "_user.phone.match(/^[0-9-]+$/) != null")
  assertEquals(validSet.then, [])                             // 본문의 잎(self-contained)
  assertEquals(nodeById(j, "set_phone").then, ["set_phone__valid"])  // 저장 set → 검증 set 연결
})

Deno.test("루프 조건은 behavior.exitCompare를 따른다 (== true 모드)", () => {
  const j = makeJson()
  wrapValidationLoops(j, { phone: { format: "숫자" } }, rule, { ...DEFAULT_LOOP_BEHAVIOR, exitCompare: "== true" })
  const sub = mainOf(j).nodes.find((n: any) => n.type === "subflow")
  assertEquals(sub.config.loop.condition, "context.phoneValid == true")
})

Deno.test("루트/부모 then 참조가 subflow로 재배선되고 set.then은 비워진다", () => {
  const j = makeJson()
  wrapValidationLoops(j, { phone: { format: "숫자" } }, rule)
  const sub = mainOf(j).nodes.find((n: any) => n.type === "subflow")
  // dialog.then 루트 목록에서 ask_phone → subflow로 교체
  assert(mainOf(j).then.includes(sub.id))
  assert(!mainOf(j).then.includes("ask_phone"))
  // set 저장 노드는 본문에서 검증 set으로 이어진다(검증 set이 본문의 잎)
  assertEquals(nodeById(j, "set_phone").then, ["set_phone__valid"])
  // ask_phone 노드는 그대로 존재(본문에서 참조)
  assert(nodeById(j, "ask_phone"))
})

Deno.test("output 멘트에 _loopCount 분기 2개가 주입된다", () => {
  const j = makeJson()
  wrapValidationLoops(j, { phone: { format: "숫자", repromptText: "숫자로 다시 입력해주세요." } }, rule)
  const text = nodeById(j, "ask_phone").config.items[0].text
  assertEquals(text.length, 2)
  assertEquals(text[0].condition, "_loopCount < 1")
  assertEquals(text[1].condition, "_loopCount >= 1")
  assertEquals(text[1].texts, ["숫자로 다시 입력해주세요."])
})

Deno.test("자유텍스트(검증 불가)는 감싸지 않는다", () => {
  const j = makeJson()
  // varFormatMap에 phone 없음 → 매칭 실패
  const res = wrapValidationLoops(j, {}, rule)
  assertEquals(res.wrapped, 0)
  assertEquals(mainOf(j).nodes.some((n: any) => n.type === "subflow"), false)
  assertEquals(mainOf(j).then, ["ask_phone", "fallback"])  // 원본 유지
})

Deno.test("멱등: 두 번 돌려도 한 번만 감싼다", () => {
  const j = makeJson()
  wrapValidationLoops(j, { phone: { format: "숫자" } }, rule)
  const res2 = wrapValidationLoops(j, { phone: { format: "숫자" } }, rule)
  assertEquals(res2.wrapped, 0)
  assertEquals(mainOf(j).nodes.filter((n: any) => n.type === "subflow").length, 1)
})

Deno.test("규칙에 정규식 없는 형식은 건너뛴다(폴백)", () => {
  const j = makeJson()
  const res = wrapValidationLoops(j, { phone: { format: "이메일" } }, rule)  // rule.formats에 이메일 없음
  assertEquals(res.wrapped, 0)
})

Deno.test("set 앞에 output(요청)이 없으면 건너뛴다", () => {
  const j = makeJson()
  // ask_phone을 set이 아닌 다른 타입으로 바꿔 'output→set' 쌍을 깬다
  nodeById(j, "ask_phone").type = "group"
  const res = wrapValidationLoops(j, { phone: { format: "숫자" } }, rule)
  assertEquals(res.wrapped, 0)
})

Deno.test("buildVarFormatMap: 검증 형식만 추출, 변수명 우선·항목명 폴백", () => {
  const responses = {
    q1: "봇 이름",
    q2: [
      {
        "수집 정보": [
          { "항목명": "전화번호", "변수명": "phone", "입력 형식": "숫자", "없을 때 되묻는 말": "숫자만요" },
          { "항목명": "생년월일", "변수명": "", "입력 형식": "날짜" },
          { "항목명": "이름", "변수명": "name", "입력 형식": "자유텍스트" },  // 검증 불가 → 제외
        ],
      },
    ],
  }
  const map = buildVarFormatMap(responses, DEFAULT_LOOP_RULE)
  assertEquals(map["phone"], { format: "숫자", repromptText: "숫자만요" })
  // 변수명 빈 경우 항목명으로 폴백(정규화 키)
  assertEquals(map["생년월일"]?.format, "날짜")
  assertEquals(map["name"], undefined)  // 자유텍스트 제외
})

Deno.test("resolveLoopRule: Loop Rule 행 파싱, 부재/이상 시 기본 폴백", () => {
  assertEquals(resolveLoopRule([]), DEFAULT_LOOP_RULE)
  assertEquals(resolveLoopRule([{ category: "Solution Rule", content: { maxCount: 9 } }]), DEFAULT_LOOP_RULE)
  const r = resolveLoopRule([{ category: "Loop Rule", content: { maxCount: 5, formats: { "숫자": "^\\d+$" }, onExhaust: "agent" } }])
  assertEquals(r.maxCount, 5)
  assertEquals(r.formats, { "숫자": "^\\d+$" })
  assertEquals(r.onExhaust, "agent")
  // 잘못된 maxCount는 기본값으로(formats 있으니 폴백 아님)
  assertEquals(resolveLoopRule([{ category: "Loop Rule", content: { maxCount: 0, formats: { "숫자": "^[0-9]+$" } } }]).maxCount, DEFAULT_LOOP_RULE.maxCount)
})

Deno.test("resolveLoopRule: 여러 행 병합 — 설정 행 + 형식 행", () => {
  const r = resolveLoopRule([
    { category: "Loop Rule", content: { maxCount: 4, formats: { "숫자": "^[0-9-]+$", "날짜": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, onExhaust: "continue" } },
    { category: "Loop Rule", content: { format: "전화번호", regex: "^[0-9]{2,3}-?[0-9]{3,4}-?[0-9]{4}$" } },
    { category: "Loop Rule", content: { format: "이메일", regex: "^[^@ ]+@[^@ ]+\\.[^@ ]+$" } },
    { category: "Solution Rule", content: { format: "무시됨", regex: "x" } },  // 다른 카테고리는 무시
  ])
  assertEquals(r.maxCount, 4)
  assertEquals(r.onExhaust, "continue")
  assertEquals(Object.keys(r.formats).sort(), ["날짜", "숫자", "이메일", "전화번호"])
  assertEquals(r.formats["전화번호"], "^[0-9]{2,3}-?[0-9]{3,4}-?[0-9]{4}$")
})

Deno.test("resolveLoopRule: 형식 행만 있고 설정 행 없으면 maxCount/onExhaust 기본값", () => {
  const r = resolveLoopRule([{ category: "Loop Rule", content: { format: "시간", regex: "^([01][0-9]|2[0-3]):[0-5][0-9]$" } }])
  assertEquals(r.maxCount, DEFAULT_LOOP_RULE.maxCount)
  assertEquals(r.onExhaust, DEFAULT_LOOP_RULE.onExhaust)
  assertEquals(r.formats, { "시간": "^([01][0-9]|2[0-3]):[0-5][0-9]$" })
})

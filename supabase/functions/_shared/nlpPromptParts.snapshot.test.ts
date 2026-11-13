import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildNlpPrompt } from "./deriveNlpData.ts"

// buildNlpPrompt를 지침 상수 조립으로 리팩터해도 출력이 한 글자도 달라지지 않음을 고정한다.
// 이 프로젝트는 프롬프트 한 줄 차이로 생성 품질이 바뀐 전례가 있다(v0.8.0 이후 NLP 규격 3회 변경).
//
// 기준선 만들기(리팩터 전에 딱 한 번):
//   SNAPSHOT_UPDATE=1 deno test --allow-read --allow-env --allow-write \
//     supabase/functions/_shared/nlpPromptParts.snapshot.test.ts
// 이후에는 절대 다시 만들지 않는다 — 다시 만들면 리팩터가 바꾼 내용을 그대로 승인해 버린다.

const SNAPSHOT = new URL("./__snapshots__/nlpPrompt.txt", import.meta.url)

const SCENARIOS = [
  {
    name: "매장 예약",
    trigger: "예약하고 싶어요",
    collects: ["매장명", "날짜", "인원"],
    result: "예약 완료 안내",
    branches: ["신용카드라고 말한 경우", "체크카드라고 말한 경우"],
  },
  {
    name: "배송 조회",
    trigger: "배송 어디쯤이에요",
    collects: ["주문번호"],
    result: "배송 상태 안내",
    branches: [],
  },
]

const ESD = [{ name: "reservation", fields: [{ name: "store_id" }, { name: "visit_date" }] }]

Deno.test("buildNlpPrompt 출력은 기준 스냅샷과 바이트 동일하다", async () => {
  const actual = buildNlpPrompt(SCENARIOS, ESD)

  if (Deno.env.get("SNAPSHOT_UPDATE") === "1") {
    await Deno.mkdir(new URL("./__snapshots__/", import.meta.url), { recursive: true })
    await Deno.writeTextFile(SNAPSHOT, actual)
    console.log("기준 스냅샷을 새로 만들었다. 리팩터 전에만 해야 한다.")
    return
  }

  const expected = await Deno.readTextFile(SNAPSHOT)
  assertEquals(actual, expected, "buildNlpPrompt 출력이 달라졌다 — 리팩터가 내용을 바꿨다")
})

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { guardApiResults } from "./apiResultGuard.ts"

const wrap = (nodes: any[], then: string[] = []) => ({ dialogs: [{ id: "main", then, nodes }] })
const main = (j: any) => j.dialogs[0]
const byId = (j: any, id: string) => main(j).nodes.find((n: any) => n.id === id)

const apiNode = (over: any = {}) => ({
  id: "api1", type: "api", label: "회원 조회", body: [], then: ["out1"], actions: [], condition: "",
  config: { apiName: "getMember", params: [], result: [{ key: "local.회원정보", value: "_result", condition: "" }] },
  ...over,
})
const okOut = () => ({ id: "out1", type: "output", label: "결과 안내", condition: "", then: [], config: { items: [] } })

Deno.test("api 결과 예외 처리: 성공 자식에 저장 변수 조건 부여 + 실패 output을 마지막에 추가", () => {
  const j = wrap([apiNode(), okOut()])
  const { guarded } = guardApiResults(j)
  assertEquals(guarded, 1)
  const api = byId(j, "api1")
  // 성공 자식(원래 무조건) → 저장 변수 truthy 조건
  assertEquals(byId(j, "out1").condition, "!_.isEmpty(local.회원정보)")
  // 실패 output이 마지막 자식(catch-all)
  const failId = api.then[api.then.length - 1]
  const fail = byId(j, failId)
  assertEquals(fail.type, "output")
  assertEquals(fail.condition, "")
  assert(JSON.stringify(fail.config).includes("잠시 후"))   // 안내 멘트
  assertEquals(api.then, ["out1", failId])
})

Deno.test("저장 변수 매핑(_result)이 없으면 건드리지 않는다", () => {
  const j = wrap([apiNode({ config: { apiName: "x", result: [] } }), okOut()])
  const { guarded } = guardApiResults(j)
  assertEquals(guarded, 0)
  assertEquals(byId(j, "api1").then, ["out1"])
})

Deno.test("멱등: 이미 저장 변수를 판별하는 자식이 있으면 스킵(designFlow 설계 존중)", () => {
  const j = wrap([
    apiNode({ then: ["ok", "fail"] }),
    { id: "ok", type: "set", condition: "local.회원정보", then: [], config: { items: [] } },
    { id: "fail", type: "output", condition: "", then: [], config: { items: [] } },
  ])
  const { guarded } = guardApiResults(j)
  assertEquals(guarded, 0)
  assertEquals(byId(j, "api1").then, ["ok", "fail"])
})

Deno.test("멱등: 재실행해도 실패 분기가 중복 추가되지 않는다", () => {
  const j = wrap([apiNode(), okOut()])
  guardApiResults(j)
  const { guarded } = guardApiResults(j)
  assertEquals(guarded, 0)
  assertEquals(byId(j, "api1").then.length, 2)
})

Deno.test("api 노드 여러 개면 각각 처리한다", () => {
  const j = wrap([
    apiNode(),
    okOut(),
    apiNode({ id: "api2", then: ["out2"], config: { apiName: "b", result: [{ key: "local.예약결과", value: "_result", condition: "" }] } }),
    { id: "out2", type: "output", condition: "", then: [], config: { items: [] } },
  ])
  const { guarded } = guardApiResults(j)
  assertEquals(guarded, 2)
  assertEquals(byId(j, "out2").condition, "!_.isEmpty(local.예약결과)")
})

Deno.test("자식이 없는 api 노드에도 실패 output은 추가된다", () => {
  const j = wrap([apiNode({ then: [] })])
  const { guarded } = guardApiResults(j)
  assertEquals(guarded, 1)
  const api = byId(j, "api1")
  assertEquals(api.then.length, 1)
  assertEquals(byId(j, api.then[0]).type, "output")
})

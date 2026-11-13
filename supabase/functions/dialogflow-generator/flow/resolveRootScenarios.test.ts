import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { resolveRootScenarioNames } from "./resolveRootScenarios.ts"

const inputs = [
  { name: "카드 재발급", trigger: "카드 재발급 하고 싶어" },
  { name: "계좌 조회", trigger: "잔액 알려줘" },
  { name: "영업점 안내", trigger: "가까운 지점 어디야" },
]

Deno.test("태그가 전부 있으면 태그를 그대로 쓴다", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["s1", "s2"],
    labelById: { s1: "x", s2: "y" },
    tagged: { s1: "카드 재발급", s2: "계좌 조회" },
    inputs,
  })
  assertEquals(r.names, { s1: "카드 재발급", s2: "계좌 조회" })
  assertEquals(r.counts.tag, 2)
})

Deno.test("태그가 하나도 없으면 라벨에서 진입 발화를 찾아 맞춘다(실측 A 케이스)", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["s1", "s2", "s3"],
    labelById: {
      s1: "사용자가 '카드 재발급 하고 싶어'로 진입했는지 판단한다",
      s2: "사용자가 '잔액 알려줘'로 진입했는지 판단한다",
      s3: "사용자가 '가까운 지점 어디야'로 진입했는지 판단한다",
    },
    tagged: {},
    inputs,
  })
  assertEquals(r.names, { s1: "카드 재발급", s2: "계좌 조회", s3: "영업점 안내" })
  assertEquals(r.counts.label, 3)
})

Deno.test("라벨에 시나리오명이 그대로 들어 있어도 맞춘다", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["a"],
    labelById: { a: "계좌 조회 시나리오 진입" },
    tagged: {},
    inputs,
  })
  assertEquals(r.names.a, "계좌 조회")
  assertEquals(r.source.a, "label")
})

Deno.test("라벨로도 못 찾으면 남은 개수가 같을 때만 순서로 짝짓는다", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["a", "b", "c"],
    labelById: { a: "진입1", b: "진입2", c: "진입3" },
    tagged: {},
    inputs,
  })
  assertEquals(r.names, { a: "카드 재발급", b: "계좌 조회", c: "영업점 안내" })
  assertEquals(r.counts.index, 3)
})

Deno.test("개수가 어긋나면 순서로 짝짓지 않는다(조용히 틀린 이름을 박느니 비운다)", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["a", "b"],
    labelById: { a: "진입1", b: "진입2" },
    tagged: {},
    inputs, // 3개
  })
  assertEquals(r.names, {})
  assertEquals(r.counts.unresolved, 2)
})

Deno.test("태그와 라벨이 섞여 있어도 각각 자기 단계로 해결한다", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["a", "b", "c"],
    labelById: { a: "무의미", b: "사용자가 '잔액 알려줘'로 진입", c: "무의미2" },
    tagged: { a: "카드 재발급" },
    inputs,
  })
  assertEquals(r.source, { a: "tag", b: "label", c: "index" })
  assertEquals(r.names.c, "영업점 안내")
})

Deno.test("이미 쓰인 이름은 다시 배정하지 않는다", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["a", "b"],
    labelById: { a: "x", b: "사용자가 '카드 재발급 하고 싶어'로 진입" },
    tagged: { a: "카드 재발급" },
    inputs: [{ name: "카드 재발급", trigger: "카드 재발급 하고 싶어" }, { name: "계좌 조회", trigger: "잔액" }],
  })
  // b의 라벨은 카드 재발급과 겹치지만 이미 a가 가져갔다 → 남은 하나로 순서 짝짓기
  assertEquals(r.names.b, "계좌 조회")
})

Deno.test("라벨 후보가 둘 이상이면 라벨 매칭을 포기한다", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["a"],
    labelById: { a: "예약 조회와 예약 취소를 함께 판단" },
    tagged: {},
    inputs: [{ name: "예약 조회" }, { name: "예약 취소" }],
  })
  // 후보 2개 → 라벨 포기, 남은 루트 1 ≠ 남은 입력 2 → 미해결
  assertEquals(r.names, {})
  assertEquals(r.counts.unresolved, 1)
})

Deno.test("입력이 비어 있으면 태그만 남는다", () => {
  const r = resolveRootScenarioNames({
    rootIds: ["a", "b"],
    labelById: { a: "x", b: "y" },
    tagged: { a: "카드 재발급" },
    inputs: [],
  })
  assertEquals(r.names, { a: "카드 재발급" })
  assertEquals(r.counts.unresolved, 1)
})

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { applyResultPatch, type ResultStore } from "./resultPatch.ts"
import { flowFingerprint } from "../../../src/lib/resultBundle/verification.js"

// 이 파일이 덮는 것: results·admin-results가 공유하는 PATCH 분기 전체.
// 추출 전에는 이 분기를 덮는 테스트가 0건이었고, 그 사이 admin-results가 네 군데 갈라졌다.
// 그래서 여기서는 "구현이 무엇을 부르는가"가 아니라 **스토어가 실제로 받은 인자**를 단언한다.

type FakeStore = ResultStore & {
  calls: { fetch: string[]; update: Record<string, unknown>[] }
}

function makeStore(opts: {
  id?: string
  logTag?: string
  row?: unknown
  fetchError?: unknown
  updateError?: unknown
} = {}): FakeStore {
  const calls = { fetch: [] as string[], update: [] as Record<string, unknown>[] }
  return {
    id: opts.id ?? "r1",
    logTag: opts.logTag ?? "[results]",
    calls,
    // deno-lint-ignore require-await
    async fetch(cols: string) {
      calls.fetch.push(cols)
      if (opts.fetchError) return { data: null, error: opts.fetchError }
      return { data: opts.row ?? {}, error: null }
    },
    // deno-lint-ignore require-await
    async update(patch: Record<string, unknown>) {
      calls.update.push(patch)
      if (opts.updateError) return { data: null, error: opts.updateError }
      return { data: { id: opts.id ?? "r1", ...patch }, error: null }
    },
  }
}

/** console 출력을 삼키고 모아 둔다 — 오류 경로 테스트가 출력을 어지럽히지 않게. */
async function quiet<T>(fn: () => Promise<T>): Promise<{ value: T; errors: string[]; logs: string[] }> {
  const errors: string[] = []
  const logs: string[] = []
  const origError = console.error
  const origLog = console.log
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")) }
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")) }
  try {
    const value = await fn()
    return { value, errors, logs }
  } finally {
    console.error = origError
    console.log = origLog
  }
}

const FLOW_A = { nodes: [{ id: "a" }] }
const FLOW_B = { nodes: [{ id: "b" }] }
const ENTRY = { ts: "2026-09-17T00:00:00Z", mode: "nl", instruction: "고쳐줘", snapshotBefore: FLOW_A }

// ────────────────────────────────────────────────────────────────────────────
// 분기 선택과 그 순서
// ────────────────────────────────────────────────────────────────────────────

Deno.test("어느 분기도 아니면 400과 기존 문구, 그리고 DB에 손대지 않는다", async () => {
  const store = makeStore()
  const out = await applyResultPatch({ name: "무관한 키" }, store)
  assertEquals(out, {
    kind: "error",
    status: 400,
    message: "esd, archived, verified, or generated_json+edit_entry, or undo:true fields are required",
  })
  assertEquals(store.calls.fetch, [])
  assertEquals(store.calls.update, [])
})

Deno.test("빈 본문·null 본문도 같은 400", async () => {
  for (const body of [{}, null]) {
    const store = makeStore()
    const out = await applyResultPatch(body, store)
    assertEquals(out.kind, "error")
    assertEquals((out as { status: number }).status, 400)
    assertEquals(store.calls.update, [])
  }
})

Deno.test("generated_json만 있고 edit_entry가 없으면 편집 분기가 아니다", async () => {
  // 편집 확정은 두 키가 짝이다. 한쪽만 오면 플로우를 이력 없이 덮어쓰게 되므로 거절해야 한다.
  const store = makeStore()
  const out = await applyResultPatch({ generated_json: FLOW_B }, store)
  assertEquals((out as { status: number }).status, 400)
  assertEquals(store.calls.update, [])
})

Deno.test("네 분기가 각각 골라진다", async () => {
  const esd = makeStore({ row: { generation_tiers: {} } })
  assertEquals((await applyResultPatch({ esd: { a: 1 } }, esd)).kind, "ok")
  assertEquals(esd.calls.fetch, ["generation_tiers"])
  assertEquals(esd.calls.update[0], { generation_tiers: { esd: { a: 1 } } })

  const arch = makeStore({ row: { generation_tiers: {} } })
  assertEquals((await quiet(() => applyResultPatch({ archived: true }, arch))).value.kind, "ok")
  assertEquals(arch.calls.update[0], { generation_tiers: { archived: true } })

  const edit = makeStore({ row: { generation_tiers: {} } })
  assertEquals((await applyResultPatch({ generated_json: FLOW_B, edit_entry: ENTRY }, edit)).kind, "ok")
  assertEquals(edit.calls.update[0].generated_json, FLOW_B)

  const undo = makeStore({ row: { generation_tiers: { edit_history: [ENTRY] }, generated_json: FLOW_B } })
  assertEquals((await applyResultPatch({ undo: true }, undo)).kind, "ok")
  assertEquals(undo.calls.fetch, ["*"])          // undo만 행 전체를 읽는다
  assertEquals(undo.calls.update[0].generated_json, FLOW_A)
})

Deno.test("분기 순서는 esd → archived → edit_entry → undo 다", async () => {
  // 여러 키를 함께 보내는 요청의 처리가 이 순서에 달려 있다.
  const a = makeStore({ row: { generation_tiers: {} } })
  await quiet(() => applyResultPatch({ esd: { a: 1 }, archived: true, generated_json: FLOW_B, edit_entry: ENTRY, undo: true }, a))
  assertEquals(a.calls.update[0], { generation_tiers: { esd: { a: 1 } } })  // esd가 이긴다

  const b = makeStore({ row: { generation_tiers: {} } })
  await quiet(() => applyResultPatch({ archived: true, generated_json: FLOW_B, edit_entry: ENTRY, undo: true }, b))
  assertEquals(b.calls.update[0], { generation_tiers: { archived: true } })  // archived가 편집을 이긴다

  const c = makeStore({ row: { generation_tiers: {} } })
  await applyResultPatch({ generated_json: FLOW_B, edit_entry: ENTRY, undo: true }, c)
  assertEquals(c.calls.fetch, ["generation_tiers"])                          // 편집이 undo를 이긴다
  assertEquals(c.calls.update[0].generated_json, FLOW_B)
})

// ────────────────────────────────────────────────────────────────────────────
// {esd}
// ────────────────────────────────────────────────────────────────────────────

Deno.test("esd 객체는 기존 번들 위에 얹히고 다른 키를 건드리지 않는다", async () => {
  const store = makeStore({ row: { generation_tiers: { flow: FLOW_A, esd: { old: true } } } })
  await applyResultPatch({ esd: { fresh: 1 } }, store)
  assertEquals(store.calls.update[0], { generation_tiers: { flow: FLOW_A, esd: { fresh: 1 } } })
})

Deno.test("esd:null은 키를 지운다(다른 키는 남는다)", async () => {
  const store = makeStore({ row: { generation_tiers: { flow: FLOW_A, esd: { old: true } } } })
  await applyResultPatch({ esd: null }, store)
  const tiers = store.calls.update[0].generation_tiers as Record<string, unknown>
  assertEquals("esd" in tiers, false)
  assertEquals(tiers.flow, FLOW_A)
})

Deno.test("esd가 배열·스칼라면 400이고 조회조차 하지 않는다", async () => {
  for (const bad of [[], [1], "str", 3, true]) {
    const store = makeStore({ row: { generation_tiers: {} } })
    const out = await applyResultPatch({ esd: bad }, store)
    assertEquals(out, { kind: "error", status: 400, message: "esd must be an object or null" })
    assertEquals(store.calls.fetch, [])
    assertEquals(store.calls.update, [])
  }
})

Deno.test("행의 generation_tiers가 배열·null이어도 빈 번들로 취급한다", async () => {
  for (const junk of [null, [1, 2], "nope", undefined]) {
    const store = makeStore({ row: { generation_tiers: junk } })
    await applyResultPatch({ esd: { a: 1 } }, store)
    assertEquals(store.calls.update[0], { generation_tiers: { esd: { a: 1 } } })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// {archived}
// ────────────────────────────────────────────────────────────────────────────

Deno.test("archived는 true·false 모두 번들에 기록된다", async () => {
  for (const v of [true, false]) {
    const store = makeStore({ row: { generation_tiers: { flow: FLOW_A } } })
    const { value } = await quiet(() => applyResultPatch({ archived: v }, store))
    assertEquals(value.kind, "ok")
    assertEquals(store.calls.update[0], { generation_tiers: { flow: FLOW_A, archived: v } })
  }
})

Deno.test("archived가 불리언이 아니면 validateArchived 문구로 400, 조회 없음", async () => {
  for (const bad of ["true", 1, null, {}]) {
    const store = makeStore({ row: { generation_tiers: {} } })
    const out = await applyResultPatch({ archived: bad }, store)
    assertEquals(out, { kind: "error", status: 400, message: "archived must be a boolean" })
    assertEquals(store.calls.fetch, [])
    assertEquals(store.calls.update, [])
  }
})

Deno.test("archived 성공은 id·logTag를 실은 한 줄을 남긴다", async () => {
  const store = makeStore({ id: "res-42", logTag: "[admin-results]", row: { generation_tiers: {} } })
  const { logs } = await quiet(() => applyResultPatch({ archived: true }, store))
  assertEquals(logs, ["[admin-results] archived=true id=res-42"])
})

// ────────────────────────────────────────────────────────────────────────────
// {verified}
// ────────────────────────────────────────────────────────────────────────────

Deno.test("verified:true는 저장된 흐름의 지문과 함께 기록된다", async () => {
  const store = makeStore({ row: { generation_tiers: { archived: true }, generated_json: FLOW_A } })
  const { value } = await quiet(() => applyResultPatch({ verified: true }, store))
  assertEquals(value.kind, "ok")
  assertEquals(store.calls.fetch, ["generation_tiers,generated_json"])
  const v = (store.calls.update[0].generation_tiers as any).verification
  assertEquals(v.status, "verified")
  assertEquals(v.flow_hash, flowFingerprint(FLOW_A))
  assertEquals((store.calls.update[0].generation_tiers as any).archived, true)
})

Deno.test("verified:false는 verification 키를 지운다", async () => {
  const store = makeStore({ row: { generation_tiers: { archived: true, verification: { status: "verified" } } } })
  await quiet(() => applyResultPatch({ verified: false }, store))
  assertEquals(store.calls.update[0], { generation_tiers: { archived: true } })
})

Deno.test("verified가 불리언이 아니면 400, 조회 없음", async () => {
  const store = makeStore()
  const out = await applyResultPatch({ verified: "yes" }, store)
  assertEquals(out, { kind: "error", status: 400, message: "verified must be a boolean" })
  assertEquals(store.calls.fetch, [])
})

// ────────────────────────────────────────────────────────────────────────────
// {generated_json, edit_entry} (+ nlp)
// ────────────────────────────────────────────────────────────────────────────

Deno.test("편집 확정은 edit_history에 push하고 flow를 함께 갱신한다", async () => {
  const older = { ts: "old", mode: "nl", instruction: "이전", snapshotBefore: { nodes: [] } }
  const store = makeStore({ row: { generation_tiers: { flow: FLOW_A, edit_history: [older] } } })
  await applyResultPatch({ generated_json: FLOW_B, edit_entry: ENTRY }, store)
  assertEquals(store.calls.update[0], {
    generation_tiers: { flow: FLOW_A, edit_history: [older, ENTRY] },
    generated_json: FLOW_B,
  })
})

Deno.test("nlp가 함께 오면 네 키가 같은 UPDATE에 실린다", async () => {
  // v0.11.0 항목 2·3이 만든 회귀의 핵심 — admin-results는 이 병합이 없어 조용히 버렸다.
  const store = makeStore({ row: { generation_tiers: {} } })
  const nlp = { intents: [{ name: "i1" }] }
  await applyResultPatch({
    generated_json: FLOW_B, edit_entry: ENTRY,
    nlp, nlp_error: "nlp 실패", esd_error: "esd 실패", api_error: "api 실패",
  }, store)
  const tiers = store.calls.update[0].generation_tiers as Record<string, unknown>
  assertEquals(tiers.nlp, nlp)
  assertEquals(tiers.nlp_error, "nlp 실패")
  assertEquals(tiers.esd_error, "esd 실패")
  assertEquals(tiers.api_error, "api 실패")
  assertEquals(tiers.edit_history, [ENTRY])
})

Deno.test("nlp:null과 빠진 사유 키는 옛 값을 지운다", async () => {
  const store = makeStore({
    row: { generation_tiers: { nlp: { old: 1 }, nlp_error: "옛 사유", esd_error: "옛 esd", api_error: "옛 api" } },
  })
  await applyResultPatch({ generated_json: FLOW_B, edit_entry: ENTRY, nlp: null }, store)
  const tiers = store.calls.update[0].generation_tiers as Record<string, unknown>
  for (const k of ["nlp", "nlp_error", "esd_error", "api_error"]) {
    assertEquals(k in tiers, false, `${k}가 남아 있다`)
  }
})

Deno.test("nlp 키가 아예 없으면 기존 nlp를 건드리지 않는다", async () => {
  const store = makeStore({ row: { generation_tiers: { nlp: { keep: 1 }, nlp_error: "유지" } } })
  await applyResultPatch({ generated_json: FLOW_B, edit_entry: ENTRY }, store)
  const tiers = store.calls.update[0].generation_tiers as Record<string, unknown>
  assertEquals(tiers.nlp, { keep: 1 })
  assertEquals(tiers.nlp_error, "유지")
})

Deno.test("nlp 검증 실패는 400이고 UPDATE가 일어나지 않는다", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ nlp: [1, 2] }, "nlp는 객체이거나 null이어야 합니다."],
    [{ nlp: {}, nlp_error: 7 }, "nlp_error는 문자열이어야 합니다."],
    [{ nlp: {}, esd_error: {} }, "esd_error는 문자열이어야 합니다."],
    [{ nlp: {}, api_error: [] }, "api_error는 문자열이어야 합니다."],
  ]
  for (const [extra, message] of cases) {
    const store = makeStore({ row: { generation_tiers: {} } })
    const out = await applyResultPatch({ generated_json: FLOW_B, edit_entry: ENTRY, ...extra }, store)
    assertEquals(out, { kind: "error", status: 400, message })
    assertEquals(store.calls.update, [], `${message}인데 UPDATE가 나갔다`)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// {undo:true}
// ────────────────────────────────────────────────────────────────────────────

Deno.test("되돌릴 것이 없으면 기존 행을 그대로 200으로 돌려주고 UPDATE하지 않는다", async () => {
  for (const tiers of [{}, { edit_history: [] }, { edit_history: "망가짐" }]) {
    const row = { id: "r1", generation_tiers: tiers, generated_json: FLOW_B }
    const store = makeStore({ row })
    const out = await applyResultPatch({ undo: true }, store)
    assertEquals(out, { kind: "ok", data: row })
    assertEquals(store.calls.update, [])
  }
})

Deno.test("되돌리기는 flow와 NLP·ESD·API 사유를 함께 복원한다", async () => {
  const entry = {
    ts: "t", mode: "nl", instruction: "설문 재생성", snapshotBefore: FLOW_A,
    nlpBefore: { intents: ["옛것"] }, nlpErrorBefore: "옛 nlp 사유",
    esdErrorBefore: "옛 esd 사유", apiErrorBefore: "옛 api 사유",
  }
  const store = makeStore({
    row: {
      generation_tiers: { edit_history: [entry], nlp: { intents: ["새것"] }, nlp_error: "새 사유" },
      generated_json: FLOW_B,
    },
  })
  await applyResultPatch({ undo: true }, store)
  const patch = store.calls.update[0]
  assertEquals(patch.generated_json, FLOW_A)
  const tiers = patch.generation_tiers as Record<string, unknown>
  assertEquals(tiers.edit_history, [])
  assertEquals(tiers.nlp, { intents: ["옛것"] })
  assertEquals(tiers.nlp_error, "옛 nlp 사유")
  assertEquals(tiers.esd_error, "옛 esd 사유")
  assertEquals(tiers.api_error, "옛 api 사유")
})

Deno.test("nlpBefore:null이면 세 사유와 nlp를 지운다", async () => {
  const entry = { ts: "t", mode: "nl", instruction: "x", snapshotBefore: FLOW_A, nlpBefore: null }
  const store = makeStore({
    row: { generation_tiers: { edit_history: [entry], nlp: { a: 1 }, nlp_error: "e", esd_error: "e2", api_error: "e3" } },
  })
  await applyResultPatch({ undo: true }, store)
  const tiers = store.calls.update[0].generation_tiers as Record<string, unknown>
  for (const k of ["nlp", "nlp_error", "esd_error", "api_error"]) {
    assertEquals(k in tiers, false, `${k}가 남아 있다`)
  }
})

Deno.test("nlpBefore가 없는 옛 entry는 flow만 복원하고 현재 NLP를 남긴다", async () => {
  const store = makeStore({
    row: { generation_tiers: { edit_history: [ENTRY], nlp: { keep: 1 }, nlp_error: "유지" }, generated_json: FLOW_B },
  })
  await applyResultPatch({ undo: true }, store)
  const patch = store.calls.update[0]
  assertEquals(patch.generated_json, FLOW_A)
  const tiers = patch.generation_tiers as Record<string, unknown>
  assertEquals(tiers.nlp, { keep: 1 })
  assertEquals(tiers.nlp_error, "유지")
})

Deno.test("여러 번 쌓인 이력에서는 맨 위 한 건만 되돌린다", async () => {
  const older = { ts: "1", mode: "nl", instruction: "먼저", snapshotBefore: { nodes: [{ id: "old" }] } }
  const store = makeStore({ row: { generation_tiers: { edit_history: [older, ENTRY] } } })
  await applyResultPatch({ undo: true }, store)
  const patch = store.calls.update[0]
  assertEquals(patch.generated_json, FLOW_A)
  assertEquals((patch.generation_tiers as Record<string, unknown>).edit_history, [older])
})

Deno.test("undo:false는 되돌리기 분기가 아니다", async () => {
  const store = makeStore({ row: { generation_tiers: { edit_history: [ENTRY] } } })
  const out = await applyResultPatch({ undo: false }, store)
  assertEquals((out as { status: number }).status, 400)
  assertEquals(store.calls.update, [])
})

// ────────────────────────────────────────────────────────────────────────────
// 오류 매핑
// ────────────────────────────────────────────────────────────────────────────

const BODIES: Array<[string, Record<string, unknown>]> = [
  ["esd", { esd: { a: 1 } }],
  ["archived", { archived: true }],
  ["edit_entry", { generated_json: FLOW_B, edit_entry: ENTRY }],
  ["undo", { undo: true }],
]

Deno.test("fetch의 PGRST116은 네 분기 모두 404 'Result not found'", async () => {
  for (const [label, body] of BODIES) {
    const store = makeStore({ fetchError: { code: "PGRST116", message: "no rows" } })
    const { value } = await quiet(() => applyResultPatch(body, store))
    assertEquals(value, { kind: "error", status: 404, message: "Result not found" }, label)
    assertEquals(store.calls.update, [], label)
  }
})

Deno.test("PGRST116이 아닌 fetch 오류는 500과 원문 메시지", async () => {
  for (const [label, body] of BODIES) {
    const store = makeStore({ fetchError: { code: "57014", message: "statement timeout" } })
    const { value } = await quiet(() => applyResultPatch(body, store))
    assertEquals(value, { kind: "error", status: 500, message: "statement timeout" }, label)
  }
})

Deno.test("update 오류는 코드와 무관하게 500", async () => {
  for (const [label, body] of BODIES) {
    const store = makeStore({
      row: { generation_tiers: { edit_history: [ENTRY] } },
      updateError: { code: "PGRST116", message: "update가 깨졌다" },
    })
    const { value } = await quiet(() => applyResultPatch(body, store))
    assertEquals(value, { kind: "error", status: 500, message: "update가 깨졌다" }, label)
  }
})

Deno.test("오류 로그 접두사는 주입된 logTag를 쓴다", async () => {
  const store = makeStore({ logTag: "[admin-results]", fetchError: { code: "PGRST116", message: "no rows" } })
  const { errors } = await quiet(() => applyResultPatch({ esd: { a: 1 } }, store))
  assertEquals(errors.length, 1)
  assert(errors[0].startsWith("[admin-results] PATCH fetch error:"), errors[0])
})

// ────────────────────────────────────────────────────────────────────────────
// 소유자 무관 — 재발 방지의 핵심 단언
// ────────────────────────────────────────────────────────────────────────────

Deno.test("같은 본문은 소유자 필터와 무관하게 같은 patch를 만든다", async () => {
  const row = {
    id: "r1",
    generation_tiers: { flow: FLOW_A, esd: { old: 1 }, nlp: { old: 2 }, edit_history: [ENTRY] },
    generated_json: FLOW_B,
  }
  const bodies: Array<[string, Record<string, unknown>]> = [
    ...BODIES,
    ["esd:null", { esd: null }],
    ["archived:false", { archived: false }],
    ["edit+nlp", { generated_json: FLOW_B, edit_entry: ENTRY, nlp: { fresh: 1 }, nlp_error: "사유" }],
  ]
  for (const [label, body] of bodies) {
    // results 스토어(id + user_id 필터)와 admin-results 스토어(id만) — 모듈은 그 차이를 모른다.
    // 두 스토어는 id와 logTag가 **서로 다르다**. 그래야 "모듈의 산출이 스토어 정체성에
    // 의존하지 않는다"가 실제로 검증된다 — 같은 id를 주면 대조축이 logTag 하나뿐이다.
    const user = makeStore({ id: "r1", logTag: "[results]", row })
    const admin = makeStore({ id: "r2", logTag: "[admin-results]", row })
    const a = await quiet(() => applyResultPatch(body, user))
    const b = await quiet(() => applyResultPatch(body, admin))
    assertEquals(a.value.kind, b.value.kind, label)
    assertEquals(user.calls.fetch, admin.calls.fetch, label)
    assertEquals(user.calls.update, admin.calls.update, label)
    assert(user.calls.update.length > 0, `${label}: UPDATE가 없어 비교가 무의미하다`)
    // 행을 고르는 일은 전적으로 스토어 몫이다 — 모듈이 id를 만들어내면 안 된다.
    assert(a.value.kind === "ok" && b.value.kind === "ok", label)
    assertEquals((a.value.data as Record<string, unknown>).id, "r1", label)
    assertEquals((b.value.data as Record<string, unknown>).id, "r2", label)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// 재갈라짐 방지 — 두 index.ts의 소스 텍스트 검사
// ────────────────────────────────────────────────────────────────────────────

const INDEXES = ["../results/index.ts", "../admin-results/index.ts"]

/** 주석을 지운 소스 — 설명문에 분기 이름이 나오는 것은 위반이 아니다. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

async function strippedIndex(rel: string): Promise<string> {
  // cwd에 의존하지 않도록 테스트 파일 기준으로 경로를 잡는다.
  return stripComments(await Deno.readTextFile(new URL(rel, import.meta.url).pathname))
}

Deno.test("두 index.ts 모두 _shared/resultPatch.ts를 쓴다", async () => {
  for (const rel of INDEXES) {
    const src = await strippedIndex(rel)
    assert(/from\s+"[^"]*_shared\/resultPatch\.ts"/.test(src), `${rel}이 resultPatch.ts를 import하지 않는다`)
    assert(src.includes("applyResultPatch("), `${rel}이 applyResultPatch를 부르지 않는다`)
  }
})

Deno.test("두 index.ts 어디에도 분기 판정이 남아 있지 않다", async () => {
  // 복제가 다시 자라는 경로는 하나뿐이다 — index.ts가 스스로 분기를 판정하기 시작하는 것.
  // 판정 식별자가 보이면 그때 막는다(admin-results가 이렇게 넷이나 갈라졌다).
  const FORBIDDEN = ["hasEsd", "hasArchived", "hasEditEntry", "hasUndo"]
  const offenders: string[] = []
  for (const rel of INDEXES) {
    const src = await strippedIndex(rel)
    src.split("\n").forEach((line, i) => {
      if (FORBIDDEN.some((name) => line.includes(name))) offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
    })
  }
  assertEquals(
    offenders,
    [],
    "index.ts가 분기를 스스로 판정한다. _shared/resultPatch.ts로 옮겨라:\n" + offenders.join("\n"),
  )
})

Deno.test("두 index.ts는 분기 로직이 쓰던 모듈을 직접 들이지 않는다", async () => {
  // validateArchived·validateNlpPatch·pushEdit·undo는 이제 resultPatch.ts의 것이다.
  // index.ts가 다시 import하면 그 자리에서 분기를 흉내 내기 시작했다는 뜻이다.
  const FORBIDDEN = ["validateArchived", "validateNlpPatch", "pushEdit", "undoEdit", "mergeBundle"]
  for (const rel of INDEXES) {
    const src = await strippedIndex(rel)
    const found = FORBIDDEN.filter((name) => src.includes(name))
    assertEquals(found, [], `${rel}에 분기 로직의 잔재가 있다: ${found.join(", ")}`)
  }
})

// 결과 PATCH 분기 로직 — results(사용자)와 admin-results(마스터 관리자)가 **한 벌**을 공유한다.
//
// 왜 분리했나: 두 index.ts는 최상단에서 serve()를 부르므로 핸들러를 떼어낼 seam이 없다
// (선례 archived.ts·nlpPatch.ts·llmError.ts). 그리고 더 중요한 이유 — 두 함수가 복제로
// 출발해 넷이나 갈라졌다(archived 분기 없음, nlp 병합 없음, esd_error·api_error 병합 없음,
// undo의 세 키 복원 없음). 주의로는 막히지 않으므로 분기 로직을 여기 한 곳에만 둔다.
// 설계: docs/superpowers/specs/2026-09-17-result-patch-share-design.md
//
// ⚠ 이 모듈은 **소유권을 모른다.** 남의 결과에 손댈 수 있는지는 전적으로 어느 스토어를
//    주입하느냐로 정해진다(results는 id+user_id, admin-results는 id로만 필터). 인증 가드는
//    각 index.ts가 그대로 갖고 있고, 이 모듈은 새 경로를 만들지 않는다.

import { pushEdit, undo as undoEdit } from "../../../src/lib/edit/editHistory.js"
import { mergeBundle } from "../../../src/lib/resultBundle/buildBundle.js"
import { validateArchived } from "../results/archived.ts"
import { validateNlpPatch } from "../results/nlpPatch.ts"
import { buildVerification, validateVerified } from "../../../src/lib/resultBundle/verification.js"

/**
 * 한 결과 행에 대한 읽기·쓰기 창구. 소유자 필터 적용 여부는 **구현이** 정한다.
 * id·logTag를 함께 들고 있는 이유: 분기 로직이 남기는 로그를 호출부 구분 없이 그대로
 * 재현하기 위해서다(`[results] archived=... id=...`).
 */
export interface ResultStore {
  /** 대상 행의 id — 로그에만 쓴다(필터는 구현 안에 이미 들어 있다). */
  id: string
  /** 로그 접두사. `[results]` 또는 `[admin-results]`. */
  logTag: string
  /** cols를 select해 한 행을 가져온다. */
  fetch(cols: string): Promise<{ data: any; error: any }>
  /** 행을 갱신하고 갱신본을 돌려준다. fetch와 같은 필터를 적용한다. */
  update(patch: Record<string, unknown>): Promise<{ data: any; error: any }>
}

export type PatchOutcome =
  | { kind: "ok"; data: unknown }
  | { kind: "error"; status: number; message: string }

/** 행이 실린 generation_tiers를 평범한 객체로만 받아들인다(배열·null·스칼라는 {}). */
function tiersOf(row: any): Record<string, unknown> {
  return row?.generation_tiers && typeof row.generation_tiers === "object" && !Array.isArray(row.generation_tiers)
    ? row.generation_tiers
    : {}
}

/** fetch 오류 → 결과. PGRST116(행 없음)만 404이고 나머지는 500이다. */
function fetchError(err: any, logTag: string, label: string): PatchOutcome {
  console.error(`${logTag} ${label}`, err)
  if (err.code === "PGRST116") {
    return { kind: "error", status: 404, message: "Result not found" }
  }
  return { kind: "error", status: 500, message: err.message }
}

/** update 오류 → 항상 500. (행 없음은 fetch 단계에서 이미 걸러졌다.) */
function updateError(err: any, logTag: string, label: string): PatchOutcome {
  console.error(`${logTag} ${label}`, err)
  return { kind: "error", status: 500, message: err.message }
}

/**
 * 결과 갱신:
 * • {esd} → ESD 부분수정(기존 경로, 하위호환)
 * • {archived} → 보관 표시 토글(목록 필터용, v0.10.0 항목 6)
 * • {verified} → 솔루션 검증 완료 표시 토글(v0.16.0 항목 2). true면 **저장된** 흐름의 지문을 함께 남긴다
 *   (클라이언트가 보낸 흐름이 아니라 DB 행 기준 — 화면이 낡은 사본이어도 지금 저장본을 검증한 것으로 기록).
 * • {generated_json, edit_entry} → 편집 확정 저장: edit_history push + flow 갱신
 *   (+ 선택적으로 {nlp, nlp_error, esd_error, api_error} — 설문 재생성 확정이 새 결과의
 *    파생물을 함께 옮긴다. 별도 분기로 두지 않는 이유: 한 요청에 같이 오므로 분리하면
 *    한쪽이 조용히 버려진다.)
 * • {generated_json, undo:true} → 되돌리기: top pop + snapshotBefore 복원
 *
 * ⚠ 분기 **순서**가 계약이다(esd → archived → verified → edit_entry → undo). 여러 키를 함께 보내는
 *    요청의 처리가 순서에 달려 있으므로 바꾸지 말 것.
 */
export async function applyResultPatch(body: any, store: ResultStore): Promise<PatchOutcome> {
  const { logTag } = store

  const hasEsd = body && "esd" in body
  const hasEditEntry = body && "generated_json" in body && "edit_entry" in body
  const hasUndo = body && body.undo === true
  const hasArchived = body && "archived" in body
  const hasVerified = body && "verified" in body

  // 기존 ESD 경로
  if (hasEsd) {
    const esd = body.esd
    if (esd !== null && (typeof esd !== "object" || Array.isArray(esd))) {
      return { kind: "error", status: 400, message: "esd must be an object or null" }
    }

    const { data: existing, error: fetchErr } = await store.fetch("generation_tiers")
    if (fetchErr) return fetchError(fetchErr, logTag, "PATCH fetch error:")

    const tiers = { ...tiersOf(existing) }
    // 계약 경유(v0.10.0) — undefined는 삭제를 뜻한다(기존 delete tiers.esd).
    const merged = (mergeBundle as any)(tiers, { esd: esd === null ? undefined : esd })

    const { data, error } = await store.update({ generation_tiers: merged })
    if (error) return updateError(error, logTag, "PATCH update error:")

    return { kind: "ok", data }
  }

  // 보관 표시 — ESD 분기와 같은 모양(검증 → 조회 → mergeBundle → update).
  if (hasArchived) {
    const invalid = validateArchived(body)
    if (invalid) {
      return { kind: "error", status: 400, message: invalid }
    }

    const { data: existing, error: fetchErr } = await store.fetch("generation_tiers")
    if (fetchErr) return fetchError(fetchErr, logTag, "PATCH archived fetch error:")

    const tiers = { ...tiersOf(existing) }
    const merged = (mergeBundle as any)(tiers, { archived: body.archived })

    const { data, error } = await store.update({ generation_tiers: merged })
    if (error) return updateError(error, logTag, "PATCH archived update error:")

    console.log(`${logTag} archived=${body.archived} id=${store.id}`)
    return { kind: "ok", data }
  }

  // 검증 표시 — archived와 같은 모양. 해제(false)는 키를 지운다(쓰기 쪽은 기본값을 저장하지 않는다).
  if (hasVerified) {
    const invalid = (validateVerified as any)(body)
    if (invalid) {
      return { kind: "error", status: 400, message: invalid }
    }

    const { data: existing, error: fetchErr } = await store.fetch("generation_tiers,generated_json")
    if (fetchErr) return fetchError(fetchErr, logTag, "PATCH verified fetch error:")

    const tiers = { ...tiersOf(existing) }
    const verification = body.verified ? (buildVerification as any)(existing?.generated_json ?? null) : undefined
    const merged = (mergeBundle as any)(tiers, { verification })

    const { data, error } = await store.update({ generation_tiers: merged })
    if (error) return updateError(error, logTag, "PATCH verified update error:")

    console.log(`${logTag} verified=${body.verified} id=${store.id}`)
    return { kind: "ok", data }
  }

  // 편집 확정 저장 경로
  if (hasEditEntry) {
    const newFlow = body.generated_json
    const entry = body.edit_entry

    const { data: existing, error: fetchErr } = await store.fetch("generation_tiers")
    if (fetchErr) return fetchError(fetchErr, logTag, "PATCH edit fetch error:")

    const editedTiers = (pushEdit as any)(tiersOf(existing), entry)

    // 설문 재생성 확정은 새 결과의 NLP를 함께 싣는다. 플로우만 옮기고 NLP를 두고 오면
    // 편집 전 응답으로 만든 옛 인텐트가 새 플로우에 남아, 내려받은 intents.csv가
    // 현재 시나리오와 맞지 않는다. 같은 UPDATE 안에서 처리해 원자적으로 만든다.
    let newTiers = editedTiers
    if (body && "nlp" in body) {
      const parsed = validateNlpPatch(body)
      if (!parsed.ok) {
        return { kind: "error", status: 400, message: parsed.error }
      }
      newTiers = (mergeBundle as any)(editedTiers, {
        nlp: parsed.nlp,
        nlp_error: parsed.nlpError,
        esd_error: parsed.esdError,
        api_error: parsed.apiError,
      })
    }

    const { data, error } = await store.update({ generation_tiers: newTiers, generated_json: newFlow })
    if (error) return updateError(error, logTag, "PATCH edit update error:")

    return { kind: "ok", data }
  }

  // 되돌리기 경로
  if (hasUndo) {
    const { data: existing, error: fetchErr } = await store.fetch("*")
    if (fetchErr) return fetchError(fetchErr, logTag, "PATCH undo fetch error:")

    const tiersRaw = tiersOf(existing)
    // undo()가 pop된 entry 자체를 반환하지 않으므로(반환값은 { tiers, flow }),
    // pop 전에 top entry를 먼저 읽어 둔다 — undo() 내부는 tiersRaw를 깊은 복제해 다루므로
    // 여기서 읽는 것은 pop에 영향받지 않는다.
    const editHistoryRaw = Array.isArray((tiersRaw as any).edit_history) ? (tiersRaw as any).edit_history : []
    const topEntry = editHistoryRaw.length > 0 ? editHistoryRaw[editHistoryRaw.length - 1] : null

    const { tiers: newTiersBase, flow: restoredFlow } = (undoEdit as any)(tiersRaw)

    // 빈 스택 undo — 안전 no-op, 현재 상태 그대로 반환
    if (restoredFlow === null) {
      return { kind: "ok", data: existing }
    }

    // top entry가 확정 직전 NLP·ESD·API 사유 스냅샷(nlpBefore 등)을 싣고 있으면 flow와 함께
    // 되돌린다. 옛 entry(이 변경 이전에 쌓인 것)는 nlpBefore 키가 없으므로 이 분기를 타지 않고
    // 기존과 동일하게 flow만 복원된다. esdErrorBefore·apiErrorBefore는 nlpBefore와 항상 같은
    // entry에 함께 실리므로(ResultSurveyEdit.jsx) nlpBefore 존재 여부로 셋을 함께 판단한다.
    const newTiers = topEntry && typeof topEntry === "object" && "nlpBefore" in topEntry
      ? (mergeBundle as any)(newTiersBase, {
          nlp: topEntry.nlpBefore ?? undefined,
          nlp_error: topEntry.nlpErrorBefore ?? undefined,
          esd_error: topEntry.esdErrorBefore ?? undefined,
          api_error: topEntry.apiErrorBefore ?? undefined,
        })
      : newTiersBase

    const { data, error } = await store.update({ generation_tiers: newTiers, generated_json: restoredFlow })
    if (error) return updateError(error, logTag, "PATCH undo update error:")

    return { kind: "ok", data }
  }

  return {
    kind: "error",
    status: 400,
    message: "esd, archived, verified, or generated_json+edit_entry, or undo:true fields are required",
  }
}

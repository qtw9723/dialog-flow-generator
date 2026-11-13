// 업로드 봇 → dialogflow_results 삽입 행 (순수).
//
// DB 사실(2026-08-28 확인): reference_id는 nullable, responses·generated_json은 NOT NULL,
// source 컬럼은 **없다**. 따라서 업로드 표식은 `reference_id === null` + `generation_tiers.upload`다.

import { buildBundle } from '../resultBundle/buildBundle.js'

/**
 * @param {object} json 업로드한 dialog JSON (그대로 저장 — 재직렬화·정규화 금지)
 * @param {{name?:string, sha256?:string, fileName?:string, uploadedAt?:string,
 *          info?:{nodeCount?:number, scenarioCount?:number, lockedCount?:number, unknownTypes?:string[], hasControls?:boolean},
 *          ownerUserId?:string|null, createdBy?:string}} meta
 * @returns {object} insert payload
 */
export function buildUploadRow(json, meta = {}) {
  const info = meta.info || {}
  return {
    generated_json: json,
    responses: {},                 // NOT NULL — 원설문이 없으므로 빈 객체
    reference_id: null,            // 업로드 표식
    ...(meta.ownerUserId ? { user_id: meta.ownerUserId } : {}),
    // 계약 경유(v0.10.0) — 'upload' 프로파일. created_by는 익명 업로드가 가능해 선택이다.
    generation_tiers: buildBundle('upload', {
      upload: {
        uploaded_at: meta.uploadedAt || null,
        original_sha256: meta.sha256 || null,
        file_name: meta.fileName || null,
        bot_name: String(meta.name || json?.name || '').trim(),
        node_count: info.nodeCount ?? null,
        scenario_count: info.scenarioCount ?? null,
        locked_count: info.lockedCount ?? null,
        unknown_types: Array.isArray(info.unknownTypes) ? info.unknownTypes : [],
        has_controls: info.hasControls === true,
      },
      created_by: meta.createdBy || undefined,
    }),
  }
}

/** 결과 행이 업로드본인지. 목록 배지·버튼 숨김의 단일 판정. */
export function isUploadedResult(row) {
  return !!(row && row.reference_id == null && row.generation_tiers?.upload)
}

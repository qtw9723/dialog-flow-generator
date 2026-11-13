// 생성 관측성 스냅샷(Instruction Bleed 역추적용).
// 규칙 세트·few-shot 주입의 "지문"을 generation_tiers jsonb에 남긴다 — DDL 없음.
// 이 모듈은 순수 계산만 한다. index.ts에서 try/catch로 감싸 생성 실패에 영향을 주지 않는다.

import type { SolutionRuleRow, RuleStage } from "./rules.ts"
import { ruleText } from "./rules.ts"

export interface ScenarioExamplesMeta {
  category: string        // extractCategory 결과 ("" = 산업군 미추출)
  candidates: number      // 해당 카테고리로 조회된 레퍼런스 수
  picked: string[]        // selectExamples가 고른 이름(관련도 순)
  injected: boolean       // 프롬프트에 실제 주입됨(renderExamples 비어있지 않음)
  examples_chars: number  // 주입 텍스트 길이
  skipped_reason: string  // skip 사유("" = 정상)
}

export interface RulesSnapshot {
  hash: string                              // 규칙 세트 전체 지문(순서 무관)
  count_by_category: Record<string, number>
  stage_hashes: Record<RuleStage, string>   // 스테이지별 주입 라인 지문 — 다단계 규칙의 blast radius 노출
  examples_hash: string                     // few-shot 주입 텍스트 지문
  model: string
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function buildScenarioExamplesMeta(input: {
  category: string
  candidates: number
  pickedNames: string[]
  examplesText: string
  skippedReason?: string
}): ScenarioExamplesMeta {
  return {
    category: input.category || "",
    candidates: input.candidates || 0,
    picked: input.pickedNames || [],
    injected: Boolean(input.examplesText),
    examples_chars: (input.examplesText || "").length,
    skipped_reason: input.skippedReason || "",
  }
}

export async function buildRulesSnapshot(
  rows: SolutionRuleRow[],
  rulesByStage: Record<RuleStage, string[]>,
  examplesText: string,
  model: string,
): Promise<RulesSnapshot> {
  // 정렬 후 직렬화 → 행 순서와 무관하게 내용이 같으면 같은 hash.
  // description 자리는 ruleText(row) 사용 — 실제 프롬프트 주입 텍스트는 description→content.text 폴백을
  // 거치므로(rules.ts), description이 빈 행(content만 있는 행)의 수정도 hash에 잡히게 한다.
  // description이 있는 행은 ruleText가 description을 그대로 반환하므로 기존과 동일 텍스트.
  const canonical = [...(rows || [])]
    .map((r) => `${r?.category || ""}|${r?.title || ""}|${ruleText(r)}|${r?.order_index ?? 0}`)
    .sort()
    .join("\n")
  const count_by_category: Record<string, number> = {}
  for (const r of rows || []) {
    const c = r?.category || ""
    count_by_category[c] = (count_by_category[c] || 0) + 1
  }
  const stage_hashes = {} as Record<RuleStage, string>
  for (const stage of ["flow", "config", "output", "condition"] as RuleStage[]) {
    stage_hashes[stage] = await sha256Hex((rulesByStage?.[stage] || []).join("\n"))
  }
  return {
    hash: await sha256Hex(canonical),
    count_by_category,
    stage_hashes,
    examples_hash: await sha256Hex(examplesText || ""),
    model,
  }
}

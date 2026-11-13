// deriveNlpData: 시나리오·ESD에서 NLP 학습 데이터(인텐트·엔티티)를 파생한다.
//
// 모델(2026-08-27 사용자 확정): 인텐트 = 시나리오 1:1(대분류), 엔티티 = 세부 구분.
//   intent 매장정보(27 examples) 안에서 무엇을 묻는지는 entity 정보(원산지/연락처/…)가 가른다.
// 산출물은 generation_tiers.nlp에만 담고 generated_json은 건드리지 않는다
// (솔루션 임포터가 모르는 필드를 거부한다).

export interface ScenarioLite { name: string; trigger: string; collects: string[]; result: string; branches?: string[] }

export interface NlpBundle {
  intents: Array<{ name: string; examples: string[] }>
  entities: Array<{ name: string; type: string; values: Array<{ value: string; synonyms: string[] }> }>
}

import { assignIntentNames } from "./intentName.ts"
import {
  entityClassifyLine, ENTITY_COLLECT_LINES,
  utteranceGuide, SYNONYM_GUIDE, OUTPUT_SPEC_FULL,
} from "./nlpPromptParts.ts"

const ALLOWED_TYPES = new Set(["synonyms", "patterns"])

export function buildNlpPrompt(scenarios: ScenarioLite[], esdSchemas: any[]): string {
  const scenText = scenarios.map((s, i) =>
    `${i + 1}. 시나리오명: ${s.name}\n   진입 발화: ${s.trigger || "(없음)"}\n   수집 항목: ${(s.collects || []).join(", ") || "(없음)"}\n   완료 결과: ${s.result || "(없음)"}\n   갈림길: ${(s.branches || []).join(" / ") || "(없음)"}`
  ).join("\n")
  const intentNames = assignIntentNames(scenarios.map((s) => s.name))
  const intentNameList = scenarios
    .map((s, i) => `${i + 1}. ${intentNames[i]}  ← 시나리오 "${s.name}"`)
    .join("\n")
  const esdText = (esdSchemas || []).map((s: any) =>
    `- ${s?.name}: ${(s?.fields || []).map((f: any) => f?.name).filter(Boolean).join(", ")}`
  ).join("\n")

  const entitySection = `[엔티티 — 두 종류]
${entityClassifyLine()}
- **각 시나리오의 "갈림길" 중 사용자 발화로 갈리는 것마다 분류 엔티티를 반드시 하나 만들어라.** 갈래 각각이 value가 된다.
  예: 갈림길이 "신용카드라고 말한 경우 / 체크카드라고 말한 경우"면 → 엔티티 "카드종류", value "신용카드"·"체크카드"(동의어에 "신용"·"크레딧"·"체크"·"직불" 등).
  이 엔티티가 없으면 플로우가 그 갈래를 고를 수단이 없다 — 빠뜨리지 마라.
  (변수 값·조회 성공 실패처럼 발화와 무관한 갈림길은 만들지 않는다.)
${ENTITY_COLLECT_LINES}`

  return `DialogFlow 챗봇의 NLP 학습 데이터를 만들어라. 인텐트(대분류)와 엔티티(세부 구분)다.

[시나리오]
${scenText}

[ESD 필드(발화에서 값을 뽑을 후보)]
${esdText || "(없음)"}

[인텐트 — 시나리오 1:1, 이름은 아래 목록으로 확정]
${intentNameList}
- **이름을 새로 짓지 마라.** 위 목록의 이름을 위 순서 그대로 쓴다(플로우 조건이 이 이름을 참조한다).
- 인텐트마다 어터런스(example) 20~30개. 진입 발화를 시드로 쓰되 그대로 복사하지 말고 확장하라.
- **다른 인텐트와 겹치는 예문을 만들지 마라** — 겹치면 NLP가 둘을 구분할 수 없다.

${entitySection}

${utteranceGuide()}

${SYNONYM_GUIDE}

${OUTPUT_SPEC_FULL}`
}

const str = (v: unknown) => String(v ?? "").trim()

// 순서를 보존하며 중복을 제거한다.
const uniq = (arr: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of arr) {
    if (!seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

export function normalizeNlpBundle(raw: any, fixedNames?: string[]): NlpBundle {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}

  // 인텐트: 이름별로 병합(순서는 최초 등장 순), examples는 합친 뒤 중복 제거.
  const intentOrder: string[] = []
  const intentExamples = new Map<string, string[]>()
  for (const it of Array.isArray(src.intents) ? src.intents : []) {
    const name = str(it?.name)
    if (!name) continue
    const examples = (Array.isArray(it?.examples) ? it.examples : []).map(str).filter(Boolean)
    if (!intentExamples.has(name)) {
      intentOrder.push(name)
      intentExamples.set(name, [])
    }
    intentExamples.get(name)!.push(...examples)
  }
  const merged = intentOrder.map((name) => ({ name, examples: uniq(intentExamples.get(name)!) }))
  // fixedNames가 있으면 LLM이 지은 이름을 버리고 시나리오 순서대로 덮어쓴다.
  // 남는 인텐트는 대응할 시나리오가 없으므로 버린다(짝 없는 인텐트는 조건이 참조할 수 없다).
  const intents = fixedNames
    ? merged.slice(0, fixedNames.length).map((it, i) => ({ ...it, name: fixedNames[i] }))
    : merged

  // 엔티티: 이름별로 병합(type은 최초 등장한 것을 유지), value별로 병합, synonyms는 합친 뒤 중복 제거.
  const entityOrder: string[] = []
  const entityType = new Map<string, string>()
  const entityValueOrder = new Map<string, string[]>()
  const entityValueSynonyms = new Map<string, Map<string, string[]>>()
  for (const e of Array.isArray(src.entities) ? src.entities : []) {
    const name = str(e?.name)
    if (!name) continue
    const t = str(e?.type)
    const type = ALLOWED_TYPES.has(t) ? t : "synonyms"
    if (!entityType.has(name)) {
      entityOrder.push(name)
      entityType.set(name, type) // 첫 번째 것을 유지 — 이후 등장한 다른 type은 무시한다.
      entityValueOrder.set(name, [])
      entityValueSynonyms.set(name, new Map())
    }
    const valueOrder = entityValueOrder.get(name)!
    const valueSynonyms = entityValueSynonyms.get(name)!
    for (const v of Array.isArray(e?.values) ? e.values : []) {
      const value = str(v?.value)
      if (!value) continue
      const synonyms = (Array.isArray(v?.synonyms) ? v.synonyms : []).map(str).filter(Boolean)
      if (!valueSynonyms.has(value)) {
        valueOrder.push(value)
        valueSynonyms.set(value, [])
      }
      valueSynonyms.get(value)!.push(...synonyms)
    }
  }
  const entities = entityOrder.map((name) => ({
    name,
    type: entityType.get(name)!,
    values: entityValueOrder.get(name)!.map((value) => ({
      value,
      synonyms: uniq(entityValueSynonyms.get(name)!.get(value)!),
    })),
  }))

  return { intents, entities }
}

export async function deriveNlpData(
  scenarios: ScenarioLite[],
  esdSchemas: any[],
  callLlm: (p: string) => Promise<string>,
): Promise<NlpBundle> {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return { intents: [], entities: [] }
  const text = await callLlm(buildNlpPrompt(scenarios, esdSchemas))
  const raw = String(text || "")
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    const snippet = raw.slice(0, 200)
    throw new Error(`deriveNlpData: LLM 응답에서 JSON 객체를 찾지 못함. 응답 앞부분: ${JSON.stringify(snippet)}`)
  }
  let parsed: any
  try {
    parsed = JSON.parse(match[0])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`deriveNlpData: JSON 파싱 실패 — ${msg}`)
  }
  return normalizeNlpBundle(parsed, assignIntentNames(scenarios.map((s) => s.name)))
}

import { FlowSpec, NodeCatalogEntry } from "./types.ts"
import { buildFlowPrompt } from "./buildFlowPrompt.ts"
import { parseFlowSpec } from "./parseFlowSpec.ts"
import { validateFlow, repairFlow } from "./validateFlow.ts"

interface DesignFlowDeps {
  responsesByRole: Record<string, any>
  catalog: NodeCatalogEntry[]
  ruleSummary: string
  callLlm: (prompt: string) => Promise<string>
  examples?: string
  esdBundle?: any
}

export async function designFlow(deps: DesignFlowDeps): Promise<{ flow: FlowSpec; llmCalls: number; repaired: boolean; reprompted: boolean }> {
  const { responsesByRole, catalog, ruleSummary, callLlm, examples = "", esdBundle } = deps
  const basePrompt = buildFlowPrompt(responsesByRole, catalog, ruleSummary, examples, esdBundle)

  // 1차 시도
  let llmCalls = 1
  let flow = parseFlowSpec(await callLlm(basePrompt))

  // 결정론적 보정 시도
  const r1 = repairFlow(flow, catalog)
  flow = r1.flow
  let validation = validateFlow(flow, catalog)
  if (validation.valid) return { flow, llmCalls, repaired: r1.repaired, reprompted: false }

  // 보정으로 안 되면 위반 목록 붙여 1회 재요청
  const retryPrompt = `${basePrompt}\n\n[직전 출력이 아래 규칙을 위반했다. 고쳐서 다시 출력하라]\n${validation.errors.map((e) => `- ${e}`).join("\n")}`
  llmCalls++
  flow = parseFlowSpec(await callLlm(retryPrompt))
  const r2 = repairFlow(flow, catalog)
  flow = r2.flow
  validation = validateFlow(flow, catalog)
  if (!validation.valid) {
    throw new Error(`FLOW_INVALID: ${validation.errors.join("; ")}`)
  }
  return { flow, llmCalls, repaired: r1.repaired || r2.repaired, reprompted: true }
}

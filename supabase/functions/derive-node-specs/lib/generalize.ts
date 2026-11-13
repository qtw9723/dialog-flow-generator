import { ExtractResult, NodeSpec } from "./types.ts"
import { buildGeneralizePrompt } from "./buildGeneralizePrompt.ts"
import { parseNodeSpecs } from "./parseSpecs.ts"

interface Deps {
  extract: ExtractResult
  descriptionsByType: Record<string, string>
  callLlm: (prompt: string) => Promise<string>
}
export async function generalizeToSpecs(deps: Deps): Promise<NodeSpec[]> {
  const prompt = buildGeneralizePrompt(deps.extract, deps.descriptionsByType)
  const text = await deps.callLlm(prompt)
  return parseNodeSpecs(text)
}

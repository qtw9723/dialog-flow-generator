import { classifyFile } from './classifyFile.js'

/**
 * 파일 뭉치를 각각 classifyFile로 분류하고 kind별 카운트를 집계한다.
 * @param {Array<{name: string, textContent: string}>} files
 * @returns {{ files: Array<{name: string, kind: string, reason: string}>, counts: {esd: number, api: number, scenario: number, ambiguous: number} }}
 */
export function classifyFiles(files) {
  const classified = files.map(({ name, textContent }) => {
    const { kind, reason } = classifyFile(name, textContent)
    return { name, kind, reason }
  })

  const counts = { esd: 0, api: 0, scenario: 0, ambiguous: 0 }
  for (const { kind } of classified) {
    counts[kind]++
  }

  return { files: classified, counts }
}

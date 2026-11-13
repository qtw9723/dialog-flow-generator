export function getMentText(node) {
  const texts = []
  for (const item of (node?.config?.items || [])) {
    for (const textBlock of (item.text || [])) {
      for (const t of (textBlock.texts || [])) {
        if (t) texts.push(t)
      }
    }
  }
  return texts.length ? texts.join(' / ') : null
}

export function buildNodeMap(flowJson) {
  const map = {}
  for (const dialog of (flowJson?.dialogs || [])) {
    for (const node of (dialog.nodes || [])) {
      map[node.id] = node
    }
  }
  return map
}

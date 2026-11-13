// api 결과 예외 처리 보장(결정론적 안전장치 — 사용자 요구 2026-07-03: "api 결과에는 항상 예외 처리").
// API 호출은 결과가 안 나올 수 있다 — 레퍼런스(샘플 봇)의 모든 api 노드는
// [성공 자식(저장 변수 조건) → 실패 output(무조건, 마지막)] 구조로 이를 처리한다(SSO 인증실패·연동에러 전례).
// 같은 관용구를 생성물에 보장한다:
//   ① api의 결과 저장 변수(config.result에서 value가 "_result"인 매핑의 key)를 찾고
//   ② 조건 없는 기존 자식에 성공 조건 `!_.isEmpty(저장변수)`를 부여한 뒤
//   ③ catch-all 실패 안내 output을 마지막 자식으로 추가한다.
// designFlow이 이미 저장 변수를 판별하는 분기를 설계했으면 존중하고 건드리지 않는다(멱등).

function savedVarOf(api: any): string {
  const mappings = Array.isArray(api?.config?.result) ? api.config.result : []
  const m = mappings.find((r: any) => String(r?.value || "").trim() === "_result" && String(r?.key || "").trim())
  return m ? String(m.key).trim() : ""
}

export function guardApiResults(generatedJson: any): { guarded: number } {
  const out = { guarded: 0 }
  const dialogs = generatedJson?.dialogs
  if (!Array.isArray(dialogs)) return out

  for (const dialog of dialogs) {
    const nodes: any[] = Array.isArray(dialog?.nodes) ? dialog.nodes : []
    const byId = new Map(nodes.map((n: any) => [n.id, n]))
    for (const api of [...nodes]) {
      if (api?.type !== "api") continue
      const savedVar = savedVarOf(api)
      if (!savedVar) continue

      const children = (api.then || []).map((id: string) => byId.get(id)).filter(Boolean)
      // 이미 저장 변수를 판별하는 자식이 있으면(designFlow 설계 또는 재실행) 스킵.
      const handled = children.some((c: any) => String(c.condition || "").includes(savedVar))
      if (handled) continue

      // ② 조건 없는 기존 자식 → 성공 조건 부여(저장 변수로 판별 — Condition Rule과 동일 원칙).
      for (const c of children) {
        if (typeof c.condition !== "string" || c.condition.trim() === "") {
          c.condition = `!_.isEmpty(${savedVar})`
        }
      }
      // ③ catch-all 실패 안내 output을 마지막 자식으로.
      const failId = `${api.id}_fail`
      nodes.push({
        id: failId, type: "output", label: "조회 실패 안내", body: [], then: [], actions: [], condition: "",
        config: {
          items: [
            {
              data: "",
              type: "text",
              text: [{ texts: ["요청을 처리하지 못했어요. 잠시 후 다시 시도해 주시겠어요?"], condition: "" }],
              channels: [{ name: "Web", use: true }],
              condition: "",
            },
          ],
          hideInput: false,
          waitInput: false,
        },
      })
      api.then = [...(api.then || []), failId]
      out.guarded++
    }
  }
  return out
}

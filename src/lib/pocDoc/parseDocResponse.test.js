import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { buildExtractionPrompt } from "./parseDocResponse.ts"

Deno.test("옵션 없이 부르면 열 인식 지침 섹션이 없다", () => {
  const p = buildExtractionPrompt("본문")
  assertEquals(p.includes("[문서(표) 레이아웃 인식 지침]"), false)
  // 하드코딩된 옛 용어가 남아 있으면 안 된다 — 사전은 DB가 단일 소스다.
  assertEquals(p.includes("Usecase"), false)
  assertEquals(p.includes("Respond Data"), false)
})

Deno.test("layoutGuide를 주면 그대로 프롬프트에 들어간다", () => {
  const p = buildExtractionPrompt("본문", { layoutGuide: "[문서(표) 레이아웃 인식 지침]\n- 진입 발화: Intent" })
  assertEquals(p.includes("[문서(표) 레이아웃 인식 지침]"), true)
  assertEquals(p.includes("Intent"), true)
})

Deno.test("confirmedColumns가 layoutGuide보다 뒤에 온다 — 나중 지침이 우선하도록", () => {
  const p = buildExtractionPrompt("본문", { layoutGuide: "GUIDE_MARK", confirmedColumns: "CONFIRM_MARK" })
  assertEquals(p.indexOf("GUIDE_MARK") < p.indexOf("CONFIRM_MARK"), true, p)
})

Deno.test("본문 텍스트는 항상 포함된다", () => {
  assertEquals(buildExtractionPrompt("배송 조회 봇").includes("배송 조회 봇"), true)
})

Deno.test("빈 옵션 문자열은 섹션을 만들지 않는다", () => {
  const p = buildExtractionPrompt("본문", { layoutGuide: "", confirmedColumns: "" })
  assertEquals(p.includes("[사용자 확정 열 매핑]"), false)
})

Deno.test("자연어 인식 지침과 응답 스키마는 그대로 남아 있다", () => {
  const p = buildExtractionPrompt("본문")
  assertEquals(p.includes("[자연어 설명 인식 지침]"), true)
  assertEquals(p.includes("scenarios"), true)
})

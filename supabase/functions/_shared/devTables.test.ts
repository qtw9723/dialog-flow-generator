import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { isDevRequest, tablePicker } from "./devTables.ts"

Deno.test("isDevRequest: -dev 슬러그 경로만 true", () => {
  assertEquals(isDevRequest("https://x.supabase.co/functions/v1/dialogflow-generator-dev"), true)
  assertEquals(isDevRequest("https://x.supabase.co/functions/v1/dialogflow-generator"), false)
  assertEquals(isDevRequest("https://x.supabase.co/functions/v1/results-dev"), true)
  // 쿼리스트링·트레일링 슬래시 무관
  assertEquals(isDevRequest("https://x.supabase.co/functions/v1/results-dev?id=1"), true)
  assertEquals(isDevRequest("not-a-url"), false)
})

Deno.test("tablePicker: dev면 dev_ 접두사, 아니면 그대로", () => {
  const dev = tablePicker(true)
  const prod = tablePicker(false)
  assertEquals(dev("questions"), "dev_questions")
  assertEquals(dev("dialogflow_results"), "dev_dialogflow_results")
  assertEquals(prod("questions"), "questions")
})

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import {
  SCREENSHOT_BUCKET,
  isExpiredScreenshot,
  parseJpegDataUrl,
  screenshotObjectPath,
} from "../_shared/screenshotStorage.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  })

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const dev = isDevRequest(req.url)
    const T = tablePicker(dev)

    // 피드백 작성 (사용자 — 공개)
    if (req.method === "POST") {
      const { name, content, screenshot } = await req.json().catch(() => ({}))
      const trimmedName = typeof name === "string" ? name.trim() : ""
      const trimmedContent = typeof content === "string" ? content.trim() : ""
      if (!trimmedName || !trimmedContent) {
        return json({ error: "이름과 피드백 내용을 모두 입력해 주세요." }, 400)
      }
      // 스크린샷(선택): JPEG data URL → Storage 업로드 후 DB엔 경로만. 형식이 어긋나거나 업로드 실패면 스크린샷만 무시(텍스트는 저장 — best-effort).
      if (typeof screenshot === "string" && screenshot.length > 2_000_000) {
        return json({ error: "스크린샷이 너무 큽니다(2MB 초과)." }, 400)
      }
      let shotPath: string | null = null
      const b64 = parseJpegDataUrl(screenshot)
      if (b64) {
        const path = screenshotObjectPath(dev, crypto.randomUUID())
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const { error: upErr } = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, bytes, { contentType: "image/jpeg" })
        if (upErr) console.error("[feedback] screenshot upload error:", upErr)
        else shotPath = path
      }
      const { data, error } = await supabase
        .from(T("dialogflow_feedback"))
        .insert([{ name: trimmedName, content: trimmedContent, ...(shotPath ? { screenshot_path: shotPath } : {}) }])
        .select()
        .single()
      if (error) {
        console.error("[feedback] POST error:", error)
        if (shotPath) await supabase.storage.from(SCREENSHOT_BUCKET).remove([shotPath]).catch(() => {})
        return json({ error: error.message }, 500)
      }
      return json(data, 201)
    }

    // 피드백 목록 (관리자) — 만료 스크린샷 lazy cleanup 후 signed URL 발급
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from(T("dialogflow_feedback"))
        .select("*")
        .order("created_at", { ascending: false })
      if (error) {
        console.error("[feedback] GET error:", error)
        return json({ error: error.message }, 500)
      }
      const rows = data || []

      // 보존 정책: 완료 후 보존기간 경과분은 스토리지 객체 삭제 + 경로 비움(best-effort — 실패해도 목록은 반환)
      const now = new Date()
      const expired = rows.filter((r: Record<string, unknown>) => isExpiredScreenshot(r, now))
      if (expired.length > 0) {
        const paths = expired.map((r: { screenshot_path: string }) => r.screenshot_path)
        const { error: rmErr } = await supabase.storage.from(SCREENSHOT_BUCKET).remove(paths)
        if (rmErr) console.error("[feedback] screenshot cleanup error:", rmErr)
        else {
          await supabase
            .from(T("dialogflow_feedback"))
            .update({ screenshot_path: null })
            .in("id", expired.map((r: { id: string }) => r.id))
          for (const r of expired) r.screenshot_path = null
        }
      }

      // 남은 스크린샷에 1시간짜리 signed URL 부여(프론트는 screenshot_url만 사용)
      const livePaths = rows.map((r: { screenshot_path?: string | null }) => r.screenshot_path).filter(Boolean) as string[]
      if (livePaths.length > 0) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .createSignedUrls(livePaths, 3600)
        if (signErr) console.error("[feedback] signed url error:", signErr)
        const byPath = new Map((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]))
        for (const r of rows) {
          if (r.screenshot_path) r.screenshot_url = byPath.get(r.screenshot_path) || null
        }
      }
      return json(rows)
    }

    // 완료 처리 토글 (관리자)
    if (req.method === "PATCH") {
      const { id, completed } = await req.json().catch(() => ({}))
      if (!id || typeof completed !== "boolean") {
        return json({ error: "id와 completed(boolean)가 필요합니다." }, 400)
      }
      const { data, error } = await supabase
        .from(T("dialogflow_feedback"))
        .update({ completed, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()
      if (error) {
        console.error("[feedback] PATCH error:", error)
        return json({ error: error.message }, 500)
      }
      return json(data)
    }

    return json({ error: "Method not allowed" }, 405)
  } catch (err) {
    console.error("[feedback] Unexpected error:", err)
    return json({ error: (err as Error).message || "Unexpected error" }, 500)
  }
})

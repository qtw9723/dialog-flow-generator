import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { sha256Hex, computeExpiry, isExpired, emailsMatch } from "./logic.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  })

// 신뢰 기기 로그인.
//  - action=register: 사용자 JWT 인증 필요. 최초 OTP 성공 후 클라이언트가 생성한 기기 토큰을
//    받아 sha256만 trusted_devices에 저장(만료 30일).
//  - action=login: 인증 없음(anon). {email, token} → 해시로 행 조회 + 만료/이메일 검증 후
//    magiclink token_hash 발급(메일 미발송). 신뢰 기기 아니면 {trusted:false}.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )
    const action = new URL(req.url).searchParams.get("action")
    const nowMs = Date.now()

    // --- 기기 등록 (사용자 JWT 필요) ---
    if (action === "register") {
      const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
      const { data: { user } } = await supabase.auth.getUser(accessToken)
      if (!user) return json({ error: "Unauthorized" }, 401)

      const { token } = await req.json().catch(() => ({}))
      if (typeof token !== "string" || token.length < 16) {
        return json({ error: "Invalid token" }, 400)
      }
      const tokenHash = await sha256Hex(token)
      const userAgent = req.headers.get("User-Agent") ?? null

      const { error } = await supabase
        .from("trusted_devices")
        .upsert(
          {
            user_id: user.id,
            token_hash: tokenHash,
            user_agent: userAgent,
            last_used_at: new Date(nowMs).toISOString(),
            expires_at: computeExpiry(nowMs),
          },
          { onConflict: "token_hash" },
        )
      if (error) {
        console.error("[trusted-device] register error:", error)
        return json({ error: error.message }, 500)
      }
      return json({ ok: true })
    }

    // --- 이메일-전용 로그인 (인증 없음) ---
    if (action === "login") {
      const { email, token } = await req.json().catch(() => ({}))
      if (typeof email !== "string" || typeof token !== "string" || !email.trim() || !token) {
        return json({ trusted: false })
      }
      const tokenHash = await sha256Hex(token)

      const { data: device } = await supabase
        .from("trusted_devices")
        .select("id, user_id, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle()

      if (!device || isExpired(device.expires_at, nowMs)) {
        return json({ trusted: false })
      }

      // 행 소유자 이메일 == 입력 이메일 검증 (다른 사람 이메일로 이 기기를 못 쓰게).
      const { data: ures } = await supabase.auth.admin.getUserById(device.user_id)
      const ownerEmail = ures?.user?.email ?? ""
      if (!ownerEmail || !emailsMatch(ownerEmail, email)) {
        return json({ trusted: false })
      }

      // magiclink 발급(메일 미발송). 클라이언트가 token_hash로 verifyOtp → 세션 수립.
      const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: ownerEmail,
      })
      if (linkErr || !link?.properties?.hashed_token) {
        console.error("[trusted-device] generateLink error:", linkErr)
        return json({ trusted: false })
      }

      // 사용 시각/만료 슬라이딩 갱신(베스트에포트).
      await supabase
        .from("trusted_devices")
        .update({
          last_used_at: new Date(nowMs).toISOString(),
          expires_at: computeExpiry(nowMs),
        })
        .eq("id", device.id)

      return json({ trusted: true, token_hash: link.properties.hashed_token })
    }

    return json({ error: "Unknown action" }, 400)
  } catch (err) {
    console.error("[trusted-device] error:", err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

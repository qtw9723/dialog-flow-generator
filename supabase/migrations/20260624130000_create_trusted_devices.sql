-- 신뢰 기기: 한 번 OTP 로그인한 기기는 이메일만으로 재로그인. 원본 토큰은 저장하지 않고
-- sha256 해시만 저장. service_role(Edge Function trusted-device) 전용 접근.
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS trusted_devices_user_id_idx ON public.trusted_devices (user_id);

-- RLS 활성화 + 정책 없음 → 익명/사용자 키로는 접근 불가. service_role만 우회 접근.
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

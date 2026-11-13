-- 결과물 소유자(canonical). 생성자 이메일은 generation_tiers->>'created_by'(JSONB)에 표시용으로 유지.
ALTER TABLE public.dialogflow_results
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dialogflow_results_user_id ON public.dialogflow_results(user_id);

-- 베스트에포트 백필: generation_tiers.created_by 이메일 ↔ auth.users.email 매칭.
UPDATE public.dialogflow_results r
SET user_id = u.id
FROM auth.users u
WHERE r.user_id IS NULL
  AND (r.generation_tiers->>'created_by') IS NOT NULL
  AND (r.generation_tiers->>'created_by') <> ''
  AND lower(r.generation_tiers->>'created_by') = lower(u.email);

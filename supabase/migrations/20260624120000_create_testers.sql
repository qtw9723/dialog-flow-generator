-- 테스터 계정 + 승인 상태. auth.users와 1:1.
CREATE TABLE IF NOT EXISTS public.testers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by text
);

-- 신규 가입 시 testers 행 자동 생성(pending).
CREATE OR REPLACE FUNCTION public.handle_new_tester()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.testers (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_tester ON auth.users;
CREATE TRIGGER on_auth_user_created_tester
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_tester();

-- 기존 auth.users 백필.
INSERT INTO public.testers (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- RLS: 본인 행만 SELECT. (INSERT는 트리거, UPDATE는 service_role 함수가 담당.)
ALTER TABLE public.testers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS testers_select_own ON public.testers;
CREATE POLICY testers_select_own ON public.testers
  FOR SELECT USING (auth.uid() = id);

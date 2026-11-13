-- 사용자가 결과에서 떼어 등록한 시나리오 자산(v0.10.0 항목 5, A단계).
-- 각 행 = 자체-완결 미니봇 flow_json + 그 시나리오에 귀속된 자산(ESD·NLP·API).
--
-- ⚠ dialogflow_scenario_references와 **분리**한다. 그 테이블은 few-shot 주입 소스라
--   (dialogflow-generator가 사용자 산업군의 레퍼런스를 생성 프롬프트에 예시로 넣는다),
--   검증되지 않은 사용자 자산을 섞으면 모든 생성에 자동 주입된다. 화면만 합치고 테이블은 가른다.

CREATE TABLE IF NOT EXISTS public.dialogflow_scenario_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  flow_json JSONB NOT NULL,
  assets JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_email TEXT,
  source_result_id UUID,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- ⚠ 이 리터럴 목록의 source of truth는 `src/lib/scenarioCategories.js`의 SCENARIO_CATEGORIES다
  --    (프론트 탭 · scenario-assets/validate.ts · scenario-references/index.ts가 전부 그 모듈에서 파생).
  --    SQL에서는 리터럴을 피할 수 없으니, 카테고리를 늘릴 때 그 모듈과 **여기 두 곳**(본 테이블 +
  --    아래 dev 미러 제약)을 함께 고친다.
  CONSTRAINT valid_asset_category CHECK (category IN ('금융','물류','소매','도매','의료','기타'))
);

CREATE INDEX IF NOT EXISTS idx_scenario_assets_category
  ON public.dialogflow_scenario_assets(category, order_index);

COMMENT ON TABLE public.dialogflow_scenario_assets IS
  '사용자 등록 시나리오 자산(미니봇 flow_json + 귀속 자산). 전원 공용, few-shot 주입 대상 아님';
COMMENT ON COLUMN public.dialogflow_scenario_assets.assets IS
  '{ esd_schemas: [], nlp: { intents: [], entities: [] }, api_defs: [] }';
COMMENT ON COLUMN public.dialogflow_scenario_assets.owner_email IS
  '등록자 로그인 이메일 — 목록 배지(내 자산/팀 자산)와 삭제 권한 판정';
COMMENT ON COLUMN public.dialogflow_scenario_assets.source_result_id IS
  '출처 결과 id(추적용). FK가 아니다 — 결과가 지워져도 자산은 남는다';

-- DEV 미러(-dev 슬러그가 tablePicker로 고른다).
-- LIKE ... INCLUDING ALL은 이 저장소의 관례이고 기본값·인덱스를 정확히 복사해 준다.
CREATE TABLE IF NOT EXISTS public.dev_dialogflow_scenario_assets
  (LIKE public.dialogflow_scenario_assets INCLUDING ALL);

-- ⚠ 미러의 CHECK 제약 이름을 `valid_asset_category`로 못박는다.
-- PostgreSQL 15에서 LIKE ... INCLUDING ALL은 CHECK 제약 **이름을 그대로 보존**하므로
-- (2026-09-11 postgres:15에서 직접 확인) 아래 블록은 보통 아무 일도 하지 않는다.
-- 그래도 남겨두는 이유: 이름이 보존되지 않는 버전·경로로 만들어진 미러가 있으면
-- 본 테이블과 미러의 제약 이름이 갈려, 7번째 카테고리를 추가할 때 DROP CONSTRAINT를
-- 두 벌로 써야 하고 그게 이 계획이 경계하는 divergence의 씨앗이 된다.
--
-- ⚠ 여기서 "이름이 다른 CHECK를 전부 DROP"하지 않는다. 이 파일은 멱등 SQL로 다시 실행될 수
--    있는데, 그런 루프는 나중에 누가 미러에 더한 **정상적인 CHECK까지 조용히 지운다**
--    (2026-09-11 리뷰 실측). 없을 때만 더하는 것으로 충분하다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.dev_dialogflow_scenario_assets'::regclass
       AND conname = 'valid_asset_category'
  ) THEN
    ALTER TABLE public.dev_dialogflow_scenario_assets
      ADD CONSTRAINT valid_asset_category
      CHECK (category IN ('금융','물류','소매','도매','의료','기타'));
  END IF;
END $$;

-- RLS: 2026-07-08 전면 적용 규약. 엣지 함수가 service_role로 접근하므로 anon 정책은 두지 않는다.
ALTER TABLE public.dialogflow_scenario_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_dialogflow_scenario_assets ENABLE ROW LEVEL SECURITY;

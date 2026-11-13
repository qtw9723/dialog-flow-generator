-- 규칙 추가(데이터-구동): solution_rules에 두 규칙을 넣고, 충돌하는 기존 스코프 규칙을 정합화한다.
-- 1) _result는 api/esd 노드 내부 전용 임시 변수 → 노드 밖(이후 노드·output·조건)에서는 그 노드가 저장한 변수를 쓴다.
-- 2) 변수 스코프는 "공유 범위"로 정한다 → 한 시나리오 안에서만 쓰는 값은 모두 local, 여러 시나리오 공유 값만 context.
-- (index.ts가 런타임에 solution_rules를 읽어 단계별로 주입하므로 엣지 재배포 없이 다음 생성부터 반영)

-- ── Rule 1: _result 스코프 ───────────────────────────────────────────────
-- 1a) Variable Usage Rule (flow/config/output 단계 주입)
INSERT INTO solution_rules (category, title, description, content, order_index) VALUES
(
  'Variable Usage Rule',
  $t$_result는 노드 내부 전용 — 밖에선 저장한 변수를 쓴다$t$,
  $d$_result는 api·esd 노드가 호출 결과를 받는 "그 노드 내부 전용" 임시 변수다. 오직 그 노드의 result 매핑(api/esd의 result에서 _result를 스코프 변수에 저장하는 곳)에서만 유효하며, 노드를 벗어나면 사라진다. 따라서 이후 노드의 config(set 값·esd 등)나 output 멘트에서 절대 _result를 직접 참조하지 마라. api 노드는 호출 결과를 반드시 result 매핑으로 의미 있는 스코프 변수에 저장하고(예: result에 [{key: "local.parkingInfo", value: "_result"}]), 이후 노드들은 그 저장 변수(local.parkingInfo)를 참조한다.$d$,
  $c${"text":"_result는 api/esd 노드 내부 전용. 밖에서는 그 노드가 result에 저장한 스코프 변수를 참조."}$c$::jsonb,
  20
),
-- 1b) Condition Rule (condition 단계 주입) — 버그가 난 지점(조건에서 _result 사용)을 직접 겨냥
(
  'Condition Rule',
  $t$조건에서 API/ESD 결과는 _result 말고 저장 변수로 판별$t$,
  $d$노드의 진입/분기 condition에서 api·esd 호출의 성공/실패나 결과 값을 판별할 때 _result를 쓰지 마라 — _result는 그 호출 노드 내부에서만 살아있어 다른 노드의 조건에서는 무효다. 반드시 api/esd 노드가 result에 저장한 스코프 변수로 조건을 만든다. 예: '_result != null'이 아니라 'local.parkingInfo != null', '_result == null'이 아니라 'local.parkingInfo == null'.$d$,
  $c${"text":"조건에서 _result 금지. api/esd가 저장한 변수(예: local.parkingInfo)로 판별."}$c$::jsonb,
  10
),
-- ── Rule 2: 스코프는 공유 범위로 ─────────────────────────────────────────
-- 2a) Variable Usage Rule (flow/config/output 단계 주입)
(
  'Variable Usage Rule',
  $t$변수 스코프는 공유 범위로 — 시나리오 내부는 local$t$,
  $d$변수 스코프(local/context)는 "데이터를 공유하는 범위"로 정한다. context는 여러 시나리오에 걸쳐 공유·재사용할 데이터를 담는 변수다. 한 시나리오 안에서만 만들고 쓰는 값은 개인정보든 아니든 모두 local로 선언·사용한다. 기본은 local이며, 다른 시나리오에서도 그 값을 써야 할 때만 context로 올린다. (예: 주차장번호·주차장정보처럼 그 시나리오에서만 쓰는 값은 local.parkingNo·local.parkingInfo)$d$,
  $c${"text":"스코프는 공유 범위로. 시나리오 내부 전용=local(개인정보 포함), 여러 시나리오 공유 값만 context."}$c$::jsonb,
  30
);

-- 2b) 충돌하는 기존 규칙 정합화: PII 기준(개인정보=local·그외=context) → 공유 범위 기준으로 교체
UPDATE solution_rules
SET description = $d$set은 직전에 입력받은 값을 변수에 저장한다. 변수명은 반드시 영어(이름→name, 전화번호→phone, 이메일→email, 진료요청내용→inquiry, 예약번호→bookNo, 인원수→pCnt). 스코프는 공유 범위로 정한다 — 한 시나리오 안에서만 쓰는 값은 개인정보 포함 모두 local, 여러 시나리오에서 공유하는 값만 context. 값을 생성하는 경우(난수 등)는 그 표현식을 쓴다.$d$,
    content = $c${"text":"set 변수명은 영어. 스코프는 공유 범위로 — 시나리오 내부 전용=local, 공유 값만 context."}$c$::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'Value Generation Rule' AND title = 'set 변수 명명·스코프';

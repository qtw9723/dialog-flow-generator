-- 피드백 스크린샷 첨부(v0.3.0): Storage 방식 — DB엔 버킷 내 경로만, 파일은 private 버킷.
-- ⚠ v0.3.0 dev 사이클 동안 미적용 — "프로덕션에 머지" 시 db push로 적용(dev_dialogflow_feedback에는 이미 반영됨).
-- 초안은 JPEG data URL을 TEXT 컬럼에 통째 저장하는 방식이었으나, 적용 전에 Storage 경로 방식으로 교체(2026-07-08).
ALTER TABLE dialogflow_feedback ADD COLUMN IF NOT EXISTS screenshot_path TEXT;
COMMENT ON COLUMN dialogflow_feedback.screenshot_path IS '첨부 스크린샷의 feedback-screenshots 버킷 내 경로(선택) — 완료 7일 후 lazy cleanup으로 객체 삭제·NULL 처리';

-- private 버킷(2MB·JPEG 한정). 완료 후 7일 경과분은 feedback 함수 GET이 lazy cleanup.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-screenshots', 'feedback-screenshots', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

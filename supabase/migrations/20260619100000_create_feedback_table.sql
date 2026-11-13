-- 사용자 피드백 저장 테이블.
-- 사용자 접근 페이지의 피드백 버튼 → 모달(이름·내용)로 작성, 관리자 페이지에서 확인·완료 처리.

CREATE TABLE IF NOT EXISTS dialogflow_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 작성자 이름(자유 입력)
  name TEXT NOT NULL,

  -- 피드백 내용
  content TEXT NOT NULL,

  -- 관리자 완료 처리 여부
  completed BOOLEAN NOT NULL DEFAULT FALSE,

  -- 타임스탬프
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE dialogflow_feedback IS '사용자 피드백(이름·내용)과 관리자 완료 처리 상태';
COMMENT ON COLUMN dialogflow_feedback.name IS '작성자 이름(자유 입력)';
COMMENT ON COLUMN dialogflow_feedback.content IS '피드백 내용';
COMMENT ON COLUMN dialogflow_feedback.completed IS '관리자 완료 처리 여부';

-- 목록 정렬(최신순)·완료 필터 인덱스
CREATE INDEX IF NOT EXISTS idx_dialogflow_feedback_created ON dialogflow_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialogflow_feedback_completed ON dialogflow_feedback(completed);

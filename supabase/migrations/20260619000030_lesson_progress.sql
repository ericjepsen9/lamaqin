-- ============================================================
-- 20260619000030_lesson_progress · 决策149 续播进度（PM 2026-06-19「按你的建议做」同意）
-- 存“上次看到哪 / 继续阅读”位置;浏览(非本班分配课)也存,故 cohort 无关。
-- ⚠️ 听/看/答的“圆满判定”仍走 study_records;本表只存续播位置(便利,不参与圆满/升学)。
-- 依赖:000020(course_lessons)、000010(profiles / is_system_admin)。additive。
-- ============================================================

CREATE TABLE user_lesson_progress (
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id     uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  last_position numeric DEFAULT 0 CHECK (last_position >= 0),   -- 文字=滚动百分比 / 音视频=秒
  last_media    text CHECK (last_media IS NULL OR last_media IN ('video','audio','text')),
  last_read_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)                              -- 每人每课一行(续播位置唯一)
);
CREATE INDEX idx_user_lesson_progress_user ON user_lesson_progress(user_id, last_read_at DESC);

-- RLS:自己读写自己的续播位置;admin 兜底读(本人进度·#193 不涉他人)
ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_lesson_progress_select ON user_lesson_progress FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY user_lesson_progress_write ON user_lesson_progress FOR ALL TO authenticated
  USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );

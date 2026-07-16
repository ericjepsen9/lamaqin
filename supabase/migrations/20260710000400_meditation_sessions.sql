-- ============================================================
-- 观修座次个人历史记录(C8·2026-07-08 UI 待设计清单)。
-- GuanStep(观修计时组件)此前"本次"座次/分钟纯组件内存态,离开页面/刷新即丢失。
-- 本表只做个人历史记录(供 GuanStep 自己显示"累计"),⚠️ 不接入 practice_logs/愿状态机/
--   升学统计——那是另一套(闻思/修两套不混·CLAUDE.md §7决策012/160精神延伸),正式座次/
--   升学硬条件("大纲≥3座×≥30分钟")仍只按"修持"页具体愿(如上师瑜伽/92修法)记录,
--   本表不改变、不参与那套判定,纯属个人计时历史的便利留存(同 user_lesson_progress/
--   daily_rituals 先例:便利性数据,非业务判定)。
-- ============================================================

CREATE TABLE meditation_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id        uuid REFERENCES course_lessons(id) ON DELETE SET NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meditation_sessions_user_lesson ON meditation_sessions(user_id, lesson_id);

-- RLS:自己读写自己的记录;admin 兜底读(同 user_lesson_progress/daily_rituals 先例)
ALTER TABLE meditation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY meditation_sessions_select ON meditation_sessions FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY meditation_sessions_write ON meditation_sessions FOR ALL TO authenticated
  USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );

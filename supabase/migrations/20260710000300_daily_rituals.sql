-- ============================================================
-- 每日发心/回向仪式书签落库(C9·2026-07-08 UI 待设计清单)。
-- 三殊胜(CLAUDE.md §3)顶底两仪式书签:前行发心 / 结行回向。v1 曾纯 useState 本地确认,
--   刷新页面/切设备即丢失,「今日已完成 N 项」也会跟着假重置——本迁移补落库。
-- 只存"今天点没点",不参与圆满/升学/关怀 5 维判定(同 user_lesson_progress 先例:
--   便利性书签,非业务判定数据)。日期口径:个人打卡跟手机本地(CLAUDE.md §1),
--   app 层显式算好 ritual_date 传入,不依赖本表以外的 CURRENT_DATE。
-- ============================================================

CREATE TABLE daily_rituals (
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ritual_date date NOT NULL,
  faxin_at    timestamptz,
  huixiang_at timestamptz,
  PRIMARY KEY (user_id, ritual_date)
);
CREATE INDEX idx_daily_rituals_user ON daily_rituals(user_id, ritual_date DESC);

-- RLS:自己读写自己的当日书签;admin 兜底读(同 user_lesson_progress 先例,#193 不涉他人)
ALTER TABLE daily_rituals ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_rituals_select ON daily_rituals FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY daily_rituals_write ON daily_rituals FOR ALL TO authenticated
  USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );

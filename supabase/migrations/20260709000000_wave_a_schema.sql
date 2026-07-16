-- ============================================================
-- 前端波·波A schema(2026-07-08 PM 交互设计逐条拍板 ①-⑪ 之 ⑤⑦⑧)
--
-- 【⑦ 画报三维度】home_posters 扩 poster_type(monthly/event/special)+日期范围。
--   monthly=年月唯一(原语义);event(法会期)/special(特别日)=按 start/end 日期范围。
--   展示优先级(App 端取图):special > event > monthly。
-- 【⑧ 平台共修场次】group_sessions.cohort_id 改可空:NULL=全平台场次(决策066)。
--   写权:has_class_role(NULL,…)=NULL(falsy)→ 天然只剩 admin 可建,无需改写策略;
--   读权:SELECT 策略补 cohort_id IS NULL(全员可见)。
--   注:UNIQUE(cohort_id,lesson_id) 对 NULL 不约束——平台场次同课可多场(演习/重播),属预期。
-- 【⑤ 座次门槛下限】min_session_minutes CHECK >0 收紧为 ≥30(大纲行105"每座不少于半小时"
--   底线+PD-2 要点③;低于30=比大纲宽松需教务点头才放开)。愿表+模板表都收;先垫平存量。
-- ============================================================

-- ⑦ 画报
ALTER TABLE home_posters
  ADD COLUMN IF NOT EXISTS poster_type text NOT NULL DEFAULT 'monthly'
    CHECK (poster_type IN ('monthly','event','special')),
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date   date;
ALTER TABLE home_posters ALTER COLUMN year DROP NOT NULL;
ALTER TABLE home_posters ALTER COLUMN month DROP NOT NULL;
ALTER TABLE home_posters DROP CONSTRAINT IF EXISTS home_posters_year_month_key;
-- 每月一张只对 monthly 生效(partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_home_posters_monthly ON home_posters(year, month) WHERE poster_type = 'monthly';
-- 各类型的完整性:monthly 须有年月;event/special 须有起止且 start<=end
ALTER TABLE home_posters ADD CONSTRAINT posters_type_fields CHECK (
  (poster_type = 'monthly' AND year IS NOT NULL AND month IS NOT NULL)
  OR (poster_type IN ('event','special') AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date)
);

-- ⑧ 平台场次
ALTER TABLE group_sessions ALTER COLUMN cohort_id DROP NOT NULL;
DROP POLICY IF EXISTS group_sessions_select ON group_sessions;
CREATE POLICY group_sessions_select ON group_sessions FOR SELECT TO authenticated USING (
  cohort_id IS NULL OR is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);

-- ⑤ 门槛 ≥30(先垫平可能的存量,再换 CHECK;该列仅在愿表·模板无此列)
UPDATE user_practice_vows SET min_session_minutes = 30 WHERE min_session_minutes < 30;
ALTER TABLE user_practice_vows DROP CONSTRAINT IF EXISTS user_practice_vows_min_session_minutes_check;
ALTER TABLE user_practice_vows ADD CONSTRAINT user_practice_vows_min_session_minutes_check
  CHECK (min_session_minutes >= 30);

-- ============================================================
-- 20260625000010_personal_self_study_records · 决策183 平行缺口① 收口(PM 2026-06-25「A」)
-- 大学演讲(18 册自学读物)无班级归属的「标记圆满」记录:自学无班 + 课外浏览(有班但本书非本专业)。
-- 与 self_study_records(班级模式·cohort NOT NULL·schema §6.6)平行:本表无 cohort_id,纯个人足迹,
--   owner-only、不进任何班级聚合;本人可见自己学修足迹(功德回向·对本人展示·决策183 规则2)。
-- ⚠️ 区别 personal_study_records(课程节·listen/read_notes 打卡·可重复):本表挂【文章 article_id】、是【进度状态】
--   (镜像 self_study_records 的 status/started_at/completed_at),每人每篇一条(UNIQUE),不可重复(大学演讲=听读即圆满)。
-- 归属路由(app 层·决策183 规则4·单一判据):标记圆满时——本书属本人在读专业(program_week_self_study)
--   → self_study_records(带 cohort);否则(无班 _或_ 非本专业浏览)→ 本表。
-- 不自动并入班级出勤(决策183 规则3):要班级 credit 走信任师兄补录。
-- 依赖:000010(profiles / is_system_admin / set_updated_at)、000020(self_study_books / self_study_articles)。additive。
-- ============================================================

CREATE TABLE personal_self_study_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book_id      uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_id   uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  status       text DEFAULT 'reading' CHECK (status IN ('not_started','reading','completed','paused')),
  started_at   date,
  completed_at date,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  -- 无 cohort_id(决策183:无班级归属)。每人每篇一条进度(镜像 self_study_records 但去掉 cohort 维度)。
  UNIQUE (user_id, article_id)
);
CREATE INDEX idx_personal_self_study_records_user ON personal_self_study_records(user_id);
CREATE TRIGGER personal_self_study_records_updated_at_trigger
  BEFORE UPDATE ON personal_self_study_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS:本人读写自己;admin 兜底读(本人足迹·#193 不涉他人互看)。
--   无 cohort → 无 zhumai/aixin 维度(无班师兄本无辅导员),故不开本班角色读,owner-only 即自然边界
--   (比 self_study_records 还严——后者辅导员/爱心可见;无班场景下本就无此二角色)。
ALTER TABLE personal_self_study_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_self_study_records_select ON personal_self_study_records FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY personal_self_study_records_insert ON personal_self_study_records FOR INSERT TO authenticated
  WITH CHECK ( user_id = auth.uid() );
CREATE POLICY personal_self_study_records_update ON personal_self_study_records FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY personal_self_study_records_delete ON personal_self_study_records FOR DELETE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );

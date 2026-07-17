-- ============================================================
-- 20260625000000_personal_study_records · 决策183（PM 2026-06-25「现在就做」）
-- 无班级归属的听/读「标记完成」记录：自学无班 + 课外浏览（有班但本课非本专业）。
-- 与 study_records（班级模式·cohort NOT NULL·决策135）平行：本表无 cohort_id，纯个人足迹，
--   owner-only、不进任何班级聚合（出勤率/圆满/升学5维）；本人可见自己学修足迹（功德回向·对本人展示）。
-- ⚠️ 区别 self_study_records（18册大学演讲·限制性课·cohort 绑定）：本表是「课程节」个人听读，挂权威节 lesson_id。
-- 归属路由（app 层·决策183 规则4）：标记完成时 cohort 有 → study_records；null → 本表（单一判据，非两特例）。
-- 不自动并入班级出勤（决策183 规则3）：要班级 credit 走信任师兄补录（填真实过去日期、即时生效）。
-- 依赖：000010（profiles / is_system_admin）、000020（course_lessons / lesson_resources）。additive。
-- ============================================================

CREATE TABLE personal_study_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id          uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  study_type         text NOT NULL CHECK (study_type IN ('listen','read_notes')),  -- 仅听/读（共修/讲考/出勤属班级活动，无班不可能）
  lesson_resource_id uuid REFERENCES lesson_resources(id) ON DELETE SET NULL,       -- 听了哪个讲者音视频（可空）
  study_date         date NOT NULL DEFAULT CURRENT_DATE,                            -- app 传设备本地日期；补录填真实过去日期
  notes              text,
  created_at         timestamptz DEFAULT now()
  -- 无 cohort_id（决策183：无班级归属）；无 is_confirmed（无班无辅导员、无审核态）；
  -- 无 UNIQUE：听两遍=两条（同 study_records·决策047 听课可重复打卡）。
);
CREATE INDEX idx_personal_study_records_user_date   ON personal_study_records(user_id, study_date DESC);
CREATE INDEX idx_personal_study_records_user_lesson ON personal_study_records(user_id, lesson_id);

-- RLS：本人读写自己；admin 兜底读（本人足迹·#193 不涉他人互看）。
--   无 cohort → 无 zhumai/aixin 维度（无班师兄本无辅导员），故不开本班角色读，owner-only 即自然边界。
ALTER TABLE personal_study_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_study_records_select ON personal_study_records FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY personal_study_records_insert ON personal_study_records FOR INSERT TO authenticated
  WITH CHECK ( user_id = auth.uid() );
CREATE POLICY personal_study_records_update ON personal_study_records FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY personal_study_records_delete ON personal_study_records FOR DELETE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );

-- cohort_extra_lessons: 班级级临时加课（B方案，决策 M4-2026-06-21）
-- 专业课表(program_weeks)是全专业共用；此表存某个班额外加的课，
-- 挂在某个 program_week 下，合并显示在师兄「本周课程」视图。
--
-- ⚠️ 三线合并修正(2026-06-22·backend_audit_plan B1)：原 admin 线版本引用了不存在的
--    `lessons` 表与 `profiles.role` 列 → 本版改为权威 schema 的 `course_lessons`
--    与 `is_system_admin()` / `has_class_role()`（角色派生自 system_admins/class_admins，
--    profiles 无 role 列）。文件时间戳由 20260621000000 改为 20260621000200，避开 main 的
--    20260621000000_search_log_intent_capture。

CREATE TABLE cohort_extra_lessons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id            uuid NOT NULL REFERENCES cohorts(id)            ON DELETE CASCADE,
  lesson_id            uuid NOT NULL REFERENCES course_lessons(id)     ON DELETE RESTRICT,
  program_week_id      uuid NOT NULL REFERENCES program_weeks(id)      ON DELETE RESTRICT,
  create_group_session boolean NOT NULL DEFAULT false,   -- 临时课默认不建共修场次
  reason               text,                             -- 加课原因（admin 备注）
  created_by           uuid REFERENCES profiles(id),
  created_at           timestamptz DEFAULT now()
);

-- 同一节课在同一班同一周只能加一次
CREATE UNIQUE INDEX cohort_extra_lessons_unique
  ON cohort_extra_lessons (cohort_id, lesson_id, program_week_id);

CREATE INDEX idx_cohort_extra_lessons_cohort ON cohort_extra_lessons (cohort_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- 抽象访问规则：admin 全表读写；本班 zhumai 读写本班加课；student 不直接读（经视图消费）。
ALTER TABLE cohort_extra_lessons ENABLE ROW LEVEL SECURITY;

-- admin：全表读写（系统管理员派生自 system_admins，非 profiles.role）
CREATE POLICY "cel_admin_all" ON cohort_extra_lessons
  FOR ALL TO authenticated
  USING ( is_system_admin() )
  WITH CHECK ( is_system_admin() );

-- zhumai：只能读写自己负责班级的临时加课
CREATE POLICY "cel_zhumai_own_cohort" ON cohort_extra_lessons
  FOR ALL TO authenticated
  USING ( has_class_role(cohort_extra_lessons.cohort_id, ARRAY['zhumai']) )
  WITH CHECK ( has_class_role(cohort_extra_lessons.cohort_id, ARRAY['zhumai']) );

-- student：只读（通过「本周课程」视图消费，不直接读本表）—— 暂不加 student 直读策略；视图层另建。

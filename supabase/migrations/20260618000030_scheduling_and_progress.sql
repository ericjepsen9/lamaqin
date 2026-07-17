-- ============================================================
-- 20260618000030_scheduling_and_progress · §6.4 排表模板 + 进度算法 + 自学/提醒
-- 源：schema_phase1 §6.4 + §12.6.5 进度算法（05-27 基线·实测10/10·复用verbatim）+ rls §2.2.v4/§2.4。
-- v2.0 delta：仅 ⭐ user_self_study_programs INSERT 收紧（§十10.4·决策119：持自学特权 OR formal 主修 OR admin）。
-- 依赖：000010（programs/profiles/cohorts/helpers）、000020（courses/course_lessons/self_study_books）。
-- ⚠️ program_week_practices.practice_id/_content_id → practices/practice_contents（§6.7·000060），FK 见文件末（本文件不建该 FK，留 000060 ALTER）。
-- ============================================================

-- ---- 排表模板 ----
CREATE TABLE program_semesters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  semester_number int NOT NULL CHECK (semester_number > 0),
  semester_name   text NOT NULL,
  starts_week     int NOT NULL CHECK (starts_week > 0),
  ends_week       int NOT NULL CHECK (ends_week >= starts_week),
  UNIQUE (program_id, semester_number)
);
CREATE INDEX idx_program_semesters_program ON program_semesters(program_id);

CREATE TABLE program_weeks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  semester_id     uuid NOT NULL REFERENCES program_semesters(id) ON DELETE CASCADE,  -- 学期号经此取（单一源）
  week_number     int NOT NULL CHECK (week_number > 0),    -- 学期内第几周（含计划内放假周编号）
  offset_days     int NOT NULL CHECK (offset_days >= 0),   -- 距 cohort.start_date 天数
  category        text,
  is_holiday      boolean DEFAULT false,                   -- 计划内放假周（占编号、不额外扣）
  notes           text,
  UNIQUE (semester_id, week_number)
);
CREATE INDEX idx_program_weeks_lookup ON program_weeks(program_id, semester_id, week_number);
CREATE INDEX idx_program_weeks_semester ON program_weeks(semester_id);

CREATE TABLE program_week_courses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id         uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id       uuid REFERENCES course_lessons(id) ON DELETE CASCADE,
  display_order   int DEFAULT 0,
  UNIQUE (week_id, lesson_id)
);
CREATE INDEX idx_program_week_courses_week ON program_week_courses(week_id);
CREATE INDEX idx_program_week_courses_lesson ON program_week_courses(lesson_id);

CREATE TABLE program_week_self_study (
  week_id         uuid REFERENCES program_weeks(id) ON DELETE CASCADE,
  book_id         uuid REFERENCES self_study_books(id) ON DELETE CASCADE,
  PRIMARY KEY (week_id, book_id)
);
CREATE INDEX idx_program_week_self_study_book ON program_week_self_study(book_id);

CREATE TABLE program_week_practices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id             uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  practice_id         uuid NOT NULL,   -- FK → practices(id)，见 000060 末 ALTER
  practice_content_id uuid,            -- FK → practice_contents(id)，见 000060 末 ALTER
  display_order       int DEFAULT 0,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (week_id, practice_id, practice_content_id)
);
CREATE INDEX idx_program_week_practices_week ON program_week_practices(week_id);
CREATE INDEX idx_program_week_practices_practice ON program_week_practices(practice_id);

-- ---- v4.0 时间灵活机制 ----
CREATE TABLE cohort_rest_weeks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  rest_start_date date NOT NULL,
  reason          text,
  created_at      timestamptz DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  UNIQUE (cohort_id, rest_start_date)
);
CREATE INDEX idx_cohort_rest_weeks_cohort ON cohort_rest_weeks(cohort_id);
CREATE INDEX idx_cohort_rest_weeks_date ON cohort_rest_weeks(rest_start_date);

CREATE TABLE user_self_study_rest_weeks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id      uuid NOT NULL REFERENCES programs(id),
  rest_start_date date NOT NULL,
  reason          text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, program_id, rest_start_date)
);
CREATE INDEX idx_user_self_study_rest_user ON user_self_study_rest_weeks(user_id);
CREATE INDEX idx_user_self_study_rest_program ON user_self_study_rest_weeks(program_id, rest_start_date);

CREATE TABLE user_self_study_programs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id      uuid NOT NULL REFERENCES programs(id),
  start_date      date NOT NULL,
  status          text DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  pace_level      text DEFAULT 'normal' CHECK (pace_level IN ('slow','normal','intensive')),
  paused_at       timestamptz,
  paused_reason   text,
  resumed_at      timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, program_id)
);
CREATE INDEX idx_user_self_study_programs_user ON user_self_study_programs(user_id);
CREATE INDEX idx_user_self_study_programs_status ON user_self_study_programs(status, program_id);
CREATE TRIGGER user_self_study_programs_updated_at_trigger
  BEFORE UPDATE ON user_self_study_programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- 提醒（决定#188）----
CREATE TABLE reminder_presets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  category      text,
  display_order int DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_reminder_presets_active ON reminder_presets(is_active, display_order);
CREATE TRIGGER reminder_presets_updated_at_trigger
  BEFORE UPDATE ON reminder_presets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  remind_time time NOT NULL,
  label       text NOT NULL,
  preset_id   uuid REFERENCES reminder_presets(id) ON DELETE SET NULL,
  is_enabled  boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_user_reminders_user ON user_reminders(user_id, is_enabled);
CREATE TRIGGER user_reminders_updated_at_trigger
  BEFORE UPDATE ON user_reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 每师兄最多 20 条提醒（决定#188）
CREATE OR REPLACE FUNCTION check_user_reminders_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM user_reminders WHERE user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION '每位师兄最多设置 20 条修行提醒';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_reminders_limit_trigger
  BEFORE INSERT ON user_reminders FOR EACH ROW EXECUTE FUNCTION check_user_reminders_limit();

-- ============================================================
-- 进度算法（§12.6.5 · 05-27 基线 · 实测10/10 · 复用 verbatim，v2.0 无改动）
--   输出 (学期号, 学期内周)；只扣计划外休息周；多班防御；p_today 须传班级时区今天。
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_week_number(
  p_user_id uuid, p_program_id uuid, p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (semester_number int, week_in_semester int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start_date date;
  v_cohort_id  uuid;
  v_rest_weeks int := 0;
  v_cal_week   int;
  v_start_sem  int;
  v_wps        int;
BEGIN
  SELECT p.start_semester, p.weeks_per_semester INTO v_start_sem, v_wps
  FROM programs p WHERE p.id = p_program_id;
  IF v_start_sem IS NULL THEN
    RETURN;
  END IF;

  -- 班级模式优先（多班防御：取 joined_at 最新兜底脏数据）
  SELECT c.id, c.start_date INTO v_cohort_id, v_start_date
  FROM class_members cm
  JOIN cohorts c ON c.id = cm.cohort_id
  WHERE cm.user_id = p_user_id AND c.program_id = p_program_id AND cm.status = 'active'
  ORDER BY cm.joined_at DESC
  LIMIT 1;

  IF v_start_date IS NOT NULL THEN
    SELECT COUNT(*) INTO v_rest_weeks
    FROM cohort_rest_weeks crw
    WHERE crw.cohort_id = v_cohort_id AND crw.rest_start_date <= p_today;
    v_cal_week := GREATEST(((p_today - v_start_date) / 7) + 1 - v_rest_weeks, 1);
    RETURN QUERY SELECT
      v_start_sem + ((v_cal_week - 1) / v_wps),
      ((v_cal_week - 1) % v_wps) + 1;
    RETURN;
  END IF;

  -- 自学模式（无留级；起始学期 = 该专业 start_semester）
  SELECT ussp.start_date INTO v_start_date
  FROM user_self_study_programs ussp
  WHERE ussp.user_id = p_user_id AND ussp.program_id = p_program_id AND ussp.status = 'active'
  LIMIT 1;

  IF v_start_date IS NOT NULL THEN
    SELECT COUNT(*) INTO v_rest_weeks
    FROM user_self_study_rest_weeks ussrw
    WHERE ussrw.user_id = p_user_id AND ussrw.program_id = p_program_id AND ussrw.rest_start_date <= p_today;
    v_cal_week := GREATEST(((p_today - v_start_date) / 7) + 1 - v_rest_weeks, 1);
    RETURN QUERY SELECT
      v_start_sem + ((v_cal_week - 1) / v_wps),
      ((v_cal_week - 1) % v_wps) + 1;
    RETURN;
  END IF;

  RETURN;  -- 不在此 program 的班/自学 → 0 行
END $$;

CREATE OR REPLACE FUNCTION get_week_lessons(
  p_program_id uuid, p_semester_number int, p_week_in_semester int
)
RETURNS TABLE (course_id uuid, course_name text, lesson_id uuid, lesson_number int, lesson_title text)
LANGUAGE sql STABLE AS $$
  SELECT co.id, co.name, cl.id, cl.lesson_number, cl.title
  FROM program_weeks pw
  JOIN program_semesters ps ON ps.id = pw.semester_id
  JOIN program_week_courses pwc ON pwc.week_id = pw.id
  JOIN course_lessons cl ON cl.id = pwc.lesson_id
  JOIN courses co ON co.id = cl.course_id
  LEFT JOIN program_courses pc ON pc.program_id = pw.program_id AND pc.course_id = co.id
  WHERE pw.program_id = p_program_id
    AND ps.semester_number = p_semester_number
    AND pw.week_number = p_week_in_semester
  ORDER BY pc.sort_order, cl.lesson_number;
$$;

CREATE OR REPLACE FUNCTION get_current_week_lessons(
  p_user_id uuid, p_program_id uuid, p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (course_id uuid, course_name text, lesson_id uuid, lesson_number int, lesson_title text)
LANGUAGE sql STABLE AS $$
  SELECT l.*
  FROM get_current_week_number(p_user_id, p_program_id, p_today) w
  CROSS JOIN LATERAL get_week_lessons(p_program_id, w.semester_number, w.week_in_semester) l;
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE program_semesters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_weeks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_self_study  ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_practices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_rest_weeks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_self_study_rest_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_self_study_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_presets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reminders           ENABLE ROW LEVEL SECURITY;

-- 排表模板：访问规则 = 任意登录读（课表全局固定）/ admin 写
CREATE POLICY program_semesters_select ON program_semesters FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_semesters_write  ON program_semesters FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY program_weeks_select ON program_weeks FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_weeks_write  ON program_weeks FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY program_week_courses_select ON program_week_courses FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_week_courses_write  ON program_week_courses FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY program_week_self_study_select ON program_week_self_study FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_week_self_study_write  ON program_week_self_study FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY program_week_practices_select ON program_week_practices FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_week_practices_write  ON program_week_practices FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- cohort_rest_weeks：访问规则 = 本班 active 成员 OR admin 读；admin 写（M9）
CREATE POLICY cohort_rest_weeks_select ON cohort_rest_weeks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM class_members cm
          WHERE cm.cohort_id = cohort_rest_weeks.cohort_id AND cm.user_id = auth.uid() AND cm.status = 'active')
  OR is_system_admin()
);
CREATE POLICY cohort_rest_weeks_write ON cohort_rest_weeks FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- user_self_study_rest_weeks：访问规则 = 自己 + admin
CREATE POLICY user_self_study_rest_weeks_select ON user_self_study_rest_weeks FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY user_self_study_rest_weeks_insert ON user_self_study_rest_weeks FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY user_self_study_rest_weeks_update ON user_self_study_rest_weeks FOR UPDATE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY user_self_study_rest_weeks_delete ON user_self_study_rest_weeks FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );

-- ⭐ user_self_study_programs：访问规则 = 自己 + admin；INSERT 收紧（§十10.4/决策119：持自学特权 OR formal 主修 OR admin）
CREATE POLICY user_self_study_programs_select ON user_self_study_programs FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY user_self_study_programs_insert ON user_self_study_programs FOR INSERT TO authenticated WITH CHECK (
  is_system_admin()
  OR ( user_id = auth.uid() AND ( has_self_study_grant() OR is_formal_student() ) )
);
CREATE POLICY user_self_study_programs_update ON user_self_study_programs FOR UPDATE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY user_self_study_programs_delete ON user_self_study_programs FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );

-- reminder_presets：访问规则 = 任意登录读 / admin 或任意班主麦·爱心 写（管理动作·原则3）
CREATE POLICY reminder_presets_select ON reminder_presets FOR SELECT TO authenticated USING ( true );
CREATE POLICY reminder_presets_insert ON reminder_presets FOR INSERT TO authenticated WITH CHECK (
  is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts())
);
CREATE POLICY reminder_presets_update ON reminder_presets FOR UPDATE TO authenticated
  USING ( is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts()) )
  WITH CHECK ( is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts()) );
CREATE POLICY reminder_presets_delete ON reminder_presets FOR DELETE TO authenticated USING (
  is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts())
);

-- ⭐ user_reminders：访问规则 = 仅师兄自己读写（admin/主麦/爱心均不可见·守原则9/10）
CREATE POLICY user_reminders_all ON user_reminders FOR ALL TO authenticated
  USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );

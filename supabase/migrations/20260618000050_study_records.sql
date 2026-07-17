-- ============================================================
-- 20260618000050_study_records · §6.6 学修打卡（6 表）
-- 源：schema_phase1 §6.6 + rls §2.6；v2.0 delta：⭐ 决策094/135 出勤后台录入（study_records INSERT 改口径）。
-- 依赖：000010（profiles/cohorts/helpers）、000020（course_lessons）、000030（program_weeks）。
-- ✅ 两处口径已由决策135 确认：① 出勤(group_attend/absent)仅主麦/admin 后台录入、师兄不自报；
--    ② study_records.cohort_id 保持 NOT NULL（自学不逐课闻思打卡；自学进度按日期 + self_study_records/思考题）。
-- ============================================================

-- group_sessions · 共修场次
CREATE TABLE group_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT,
  scheduled_at    timestamptz NOT NULL,
  session_end_at  timestamptz NOT NULL,
  cosession_type  text NOT NULL DEFAULT 'regular' CHECK (cosession_type IN ('regular','practice')),
  location        text,
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (cohort_id, lesson_id)
);
CREATE INDEX idx_group_sessions_cohort_scheduled ON group_sessions(cohort_id, scheduled_at);

-- speaking_sessions · 讲考场次（v1.0 事后创建 + 自报）
CREATE TABLE speaking_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT,
  session_end_at  timestamptz NOT NULL,
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_speaking_sessions_cohort ON speaking_sessions(cohort_id);

-- study_records · 学修打卡（审核态 is_confirmed·场景21）
CREATE TABLE study_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,  -- 决策135：保持 NOT NULL（自学不逐课闻思打卡）
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  study_type          text NOT NULL CHECK (study_type IN (
                        'listen','read_notes',
                        'speaking_present','speaking_question','speaking_observe',
                        'group_attend','group_absent',
                        'group_review','group_summary'
                      )),
  lesson_resource_id  uuid REFERENCES lesson_resources(id) ON DELETE SET NULL,
  group_session_id    uuid REFERENCES group_sessions(id) ON DELETE SET NULL,
  speaking_session_id uuid REFERENCES speaking_sessions(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES profiles(id),
  study_date          date NOT NULL DEFAULT CURRENT_DATE,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  is_confirmed        boolean DEFAULT false,
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES profiles(id)
);
-- 讲考 3 种互斥；共修出勤 2 选 1 互斥（每节每人）
CREATE UNIQUE INDEX uniq_speaking_per_lesson ON study_records(user_id, cohort_id, lesson_id) WHERE study_type LIKE 'speaking_%';
CREATE UNIQUE INDEX uniq_group_attendance_per_lesson ON study_records(user_id, cohort_id, lesson_id) WHERE study_type IN ('group_attend','group_absent');
CREATE INDEX idx_study_records_user_date ON study_records(user_id, study_date DESC);
CREATE INDEX idx_study_records_cohort_lesson ON study_records(cohort_id, lesson_id);
CREATE INDEX idx_study_records_type ON study_records(study_type);
CREATE INDEX idx_study_records_resource ON study_records(lesson_resource_id);
CREATE INDEX idx_study_records_unconfirmed ON study_records(cohort_id, user_id) WHERE is_confirmed = false;

-- program_study_types · 各班打卡要求（数据驱动 UI）
CREATE TABLE program_study_types (
  program_id    uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  study_type    text NOT NULL CHECK (study_type IN (
                  'listen','read_notes',
                  'speaking_present','speaking_question','speaking_observe',
                  'group_attend','group_absent',
                  'group_review','group_summary'
                )),
  requirement   text NOT NULL CHECK (requirement IN ('required','recommended')),
  display_order int DEFAULT 0,
  display_label text NOT NULL,
  PRIMARY KEY (program_id, study_type)
);
CREATE INDEX idx_program_study_types_program_order ON program_study_types(program_id, display_order);

-- self_study_records · 自学打卡（按文章）
CREATE TABLE self_study_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id    uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  book_id      uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_id   uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  status       text DEFAULT 'reading' CHECK (status IN ('not_started','reading','completed','paused')),
  started_at   date,
  completed_at date,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, cohort_id, article_id)
);
CREATE INDEX idx_self_study_records_user ON self_study_records(user_id);
CREATE TRIGGER self_study_records_updated_at_trigger
  BEFORE UPDATE ON self_study_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- weekly_study_summary · 周学修汇总缓存（系统生成）
CREATE TABLE weekly_study_summary (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  week_id         uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  required_count  int DEFAULT 0,
  completed_count int DEFAULT 0,
  is_complete     boolean DEFAULT false,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, cohort_id, week_id)
);
CREATE INDEX idx_weekly_study_summary_user_week ON weekly_study_summary(user_id, week_id);
CREATE TRIGGER weekly_study_summary_updated_at_trigger
  BEFORE UPDATE ON weekly_study_summary FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE group_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_study_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_study_summary ENABLE ROW LEVEL SECURITY;

-- group_sessions / speaking_sessions：访问规则 = 本班成员/管理员读；主麦+admin 写
CREATE POLICY group_sessions_select ON group_sessions FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
CREATE POLICY group_sessions_write ON group_sessions FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );
CREATE POLICY speaking_sessions_select ON speaking_sessions FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
CREATE POLICY speaking_sessions_write ON speaking_sessions FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );

-- study_records：访问规则 = 自己 + 本班主麦/爱心 + admin 读
CREATE POLICY study_records_select ON study_records FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
-- ⭐ INSERT（决策094/135 出勤后台录入·已确认）：
--   师兄自报 = 非出勤类（listen/read_notes/group_review/group_summary/讲考自报）；
--   出勤（group_attend/group_absent）= 主麦/admin 后台录入（师兄不可自报，094/135）；主麦另可记 group_*/speaking_*。
CREATE POLICY study_records_insert ON study_records FOR INSERT TO authenticated WITH CHECK (
  (
    user_id = auth.uid() AND created_by = auth.uid() AND is_class_member(cohort_id)
    AND study_type NOT IN ('group_attend','group_absent')           -- 094：出勤不可自报
  )
  OR (
    created_by = auth.uid() AND has_class_role(cohort_id, ARRAY['zhumai'])
    AND (study_type LIKE 'group_%' OR study_type LIKE 'speaking_%')  -- 主麦后台录入出勤/讲考
  )
  OR is_system_admin()
);
-- UPDATE/DELETE（审核态·场景21）：师兄改自己且未确认；主麦改本班；admin
CREATE POLICY study_records_update ON study_records FOR UPDATE TO authenticated
  USING ( (user_id = auth.uid() AND is_confirmed = false) OR has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( (user_id = auth.uid() AND is_confirmed = false) OR has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );
CREATE POLICY study_records_delete ON study_records FOR DELETE TO authenticated USING (
  (user_id = auth.uid() AND is_confirmed = false) OR is_system_admin()
);

-- program_study_types：任意登录读 / admin 写
CREATE POLICY program_study_types_select ON program_study_types FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_study_types_write  ON program_study_types FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- self_study_records：自己 + 本班主麦/爱心 + admin 读；自己写（本班成员）；自己改 + admin
CREATE POLICY self_study_records_select ON self_study_records FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
CREATE POLICY self_study_records_insert ON self_study_records FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND is_class_member(cohort_id)
);
CREATE POLICY self_study_records_update ON self_study_records FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY self_study_records_delete ON self_study_records FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);

-- weekly_study_summary：自己 + 本班主麦/爱心 + admin 读；系统（service_role）/admin 写（缓存）
CREATE POLICY weekly_study_summary_select ON weekly_study_summary FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
CREATE POLICY weekly_study_summary_write ON weekly_study_summary FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- ============================================================
-- §12.1 管理者修改师兄打卡记录 → 自动写 audit_logs（依赖 000015 audit_logs）
-- ============================================================
CREATE OR REPLACE FUNCTION study_records_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NEW.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'study_record_override', 'study_records', NEW.id,
      jsonb_build_object('subject_user_id', NEW.user_id, 'cohort_id', NEW.cohort_id,
                         'lesson_id', NEW.lesson_id, 'old_study_type', OLD.study_type, 'new_study_type', NEW.study_type));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER study_records_audit_trigger
  AFTER UPDATE ON study_records FOR EACH ROW EXECUTE FUNCTION study_records_audit();

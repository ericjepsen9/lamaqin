-- ============================================================
-- 20260618000085_care_and_events · §6.8 班级运营 + 域⑥ 关怀5维快照
-- 源：schema §6.8 + rls §2.8；v2.0 delta：+cohort_lag_snapshot（决策107·Edge cron 每日算·⭐师兄不可见）。
-- 法会全复用 events（在 000060）。daily_practice_journals 决策074 整功能延后-23（表保留·v1.0 dormant）。
-- 依赖：000010（cohorts/profiles/helpers）、000030（program_weeks）。
-- ============================================================

CREATE TABLE cohort_announcements (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title     text,
  content   text NOT NULL,
  is_pinned boolean DEFAULT false,
  posted_at timestamptz DEFAULT now(),
  posted_by uuid REFERENCES profiles(id)
);
CREATE INDEX idx_cohort_announcements_cohort_posted ON cohort_announcements(cohort_id, posted_at DESC);

-- ⭐ care_followups：师兄完全不可见（连自己被关怀的记录也不能看·#193）
CREATE TABLE care_followups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id        uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  care_worker_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  contacted_at     timestamptz NOT NULL,
  summary          text NOT NULL,
  follow_up_status text,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX idx_care_followups_student ON care_followups(student_id, contacted_at DESC);
CREATE INDEX idx_care_followups_cohort ON care_followups(cohort_id, contacted_at DESC);

CREATE TABLE cohort_weekly_practice_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  week_id         uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  week_end_date   date NOT NULL CHECK (week_end_date >= week_start_date),
  summary_data    jsonb NOT NULL,
  generated_at    timestamptz DEFAULT now(),
  shared_at       timestamptz,
  shared_by       uuid REFERENCES profiles(id),
  UNIQUE (cohort_id, week_id)
);
CREATE INDEX idx_cohort_weekly_summaries_cohort_week ON cohort_weekly_practice_summaries(cohort_id, week_start_date DESC);

-- daily_practice_journals（v1.0 dormant·延后-23；表保留）
CREATE TABLE daily_practice_journals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id    uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  journal_date date NOT NULL,
  content      text NOT NULL CHECK (length(content) > 0),
  visibility   text DEFAULT 'private' CHECK (visibility IN ('private','visible_to_zhumai')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, journal_date)
);
CREATE INDEX idx_daily_journals_user_date ON daily_practice_journals(user_id, journal_date DESC);
CREATE INDEX idx_daily_journals_cohort ON daily_practice_journals(cohort_id);
CREATE TRIGGER daily_practice_journals_updated_at_trigger
  BEFORE UPDATE ON daily_practice_journals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ⭐ cohort_lag_snapshot · 关怀5维滞后快照（决策107·Edge cron 每日重算覆盖·仅管理端·师兄不可见）
CREATE TABLE cohort_lag_snapshot (
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attendance_lag  int DEFAULT 0,   -- 出勤
  task_lag        int DEFAULT 0,   -- 日常功课
  content_lag     int DEFAULT 0,   -- 听课
  quiz_lag        int DEFAULT 0,   -- 答题
  meditation_lag  int DEFAULT 0,   -- 观修
  computed_at     timestamptz DEFAULT now(),
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX idx_cohort_lag_snapshot_cohort ON cohort_lag_snapshot(cohort_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE cohort_announcements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_followups                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_weekly_practice_summaries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_practice_journals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_lag_snapshot               ENABLE ROW LEVEL SECURITY;

-- cohort_announcements：本班成员/管理员读；主麦+admin 写
CREATE POLICY cohort_announcements_select ON cohort_announcements FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
CREATE POLICY cohort_announcements_write ON cohort_announcements FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );

-- ⭐ care_followups：仅本班主麦/爱心 + admin（师兄完全不可见·#193）；写 = 经办本人是本班主麦/爱心
CREATE POLICY care_followups_select ON care_followups FOR SELECT TO authenticated USING (
  has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
CREATE POLICY care_followups_write ON care_followups FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin() )
  WITH CHECK ( care_worker_id = auth.uid() AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) );

-- cohort_weekly_practice_summaries：本班成员/管理员读；主麦+admin 写
CREATE POLICY weekly_summaries_select ON cohort_weekly_practice_summaries FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
CREATE POLICY weekly_summaries_write ON cohort_weekly_practice_summaries FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );

-- daily_practice_journals：自己读写；visible_to_zhumai 时本班主麦可读（dormant）
CREATE POLICY daily_journals_select ON daily_practice_journals FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR ( visibility = 'visible_to_zhumai' AND cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai']) )
);
CREATE POLICY daily_journals_insert ON daily_practice_journals FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
CREATE POLICY daily_journals_update ON daily_practice_journals FOR UPDATE TO authenticated USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );
CREATE POLICY daily_journals_delete ON daily_practice_journals FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );

-- ⭐ cohort_lag_snapshot：仅本班主麦/爱心 + admin（师兄端无状态色·不可见）；写 = admin/系统(service_role)
CREATE POLICY cohort_lag_snapshot_select ON cohort_lag_snapshot FOR SELECT TO authenticated USING (
  has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
CREATE POLICY cohort_lag_snapshot_write ON cohort_lag_snapshot FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

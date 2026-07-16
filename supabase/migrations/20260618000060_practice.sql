-- ============================================================
-- 20260618000060_practice · 域② 修持模块 §6.7 ⭐核心（schema 最完整、绝大多数复用）
-- 源：schema_phase1 §6.7 + §12.2/12.3/12.5 + rls §2.7；v2.0 delta：
--   ⭐ practices 删 is_tantric（060）；practice_templates +代替方案（120）；
--      share_to_collective 恒默认 true（077，原 is_tantric→auto-false 逻辑随 is_tantric 删而作废）；
--      current_status 状态机枚举不变，**由 Edge cron TS 计算**（规范§七，不埋 DB 触发器）。
-- 依赖：000010/000015（profiles/cohorts/helpers/audit_logs）、000030（program_week_practices 补 FK）。
-- ============================================================

-- practices · ⭐ 删 is_tantric
CREATE TABLE practices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  measurement   text NOT NULL CHECK (measurement IN ('count','duration')),
  category      text CHECK (category IS NULL OR category IN ('mantra','analytical','meditation','prostration','other')),
  unit          text NOT NULL,
  description   text,
  -- ⭐ is_tantric 已删（决策060）；连带 vow.share_to_collective 的 is_tantric→auto-false 逻辑作废（恒 true·077）
  display_order int DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_practices_active_order ON practices(is_active, display_order);

CREATE TABLE practice_contents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id    uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  content_number int,
  title          text NOT NULL,
  category       text,
  description    text,
  reference_book text,
  display_order  int DEFAULT 0,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (practice_id, content_number)
);
CREATE INDEX idx_practice_contents_practice ON practice_contents(practice_id);

CREATE TABLE practice_guides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id    uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  content_number int,
  video_url      text,
  audio_url      text,
  guide_text     text,
  sort_order     int DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_practice_guides_practice ON practice_guides(practice_id, sort_order);

-- practice_templates · ⭐ +代替方案（决策120：默认方案；per-person 应用走域④代行记录）
CREATE TABLE practice_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id           uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  template_name         text NOT NULL,
  description           text,
  target_count          int,
  target_period         text NOT NULL CHECK (target_period IN ('lifetime','until_complete','daily','weekly','event')),
  default_daily_target  int,
  default_weekly_target int,
  pace_level            text CHECK (pace_level IS NULL OR pace_level IN ('fast','standard','custom')),
  starts_offset_days    int,
  duration_days         int,
  applies_to_programs   uuid[],
  -- ⭐ 代替方案（决策120）：可否代替 + 代替修法 + 代替数量（默认方案；如 600万金刚萨埵代替）
  can_substitute        boolean NOT NULL DEFAULT false,
  substitute_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,
  substitute_count      int CHECK (substitute_count IS NULL OR substitute_count > 0),
  is_active             boolean DEFAULT true,
  display_order         int DEFAULT 0,
  created_by            uuid REFERENCES profiles(id),
  created_at            timestamptz DEFAULT now()
);
CREATE INDEX idx_practice_templates_practice ON practice_templates(practice_id);
CREATE INDEX idx_practice_templates_active ON practice_templates(is_active);

CREATE TABLE cohort_recommended_templates (
  cohort_id     uuid REFERENCES cohorts(id) ON DELETE CASCADE,
  template_id   uuid REFERENCES practice_templates(id) ON DELETE CASCADE,
  binding       text NOT NULL CHECK (binding IN ('auto','recommended')),
  display_order int DEFAULT 0,
  PRIMARY KEY (cohort_id, template_id)
);
CREATE INDEX idx_cohort_recommended_templates_binding ON cohort_recommended_templates(cohort_id, binding);

CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  event_type      text NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL CHECK (end_date >= start_date),
  description     text,
  cover_image_url text,
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_events_active_start ON events(is_active, start_date);

CREATE TABLE practice_appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id    uuid REFERENCES practices(id) ON DELETE SET NULL,
  title          text NOT NULL,
  target_count   int CHECK (target_count IS NULL OR target_count > 0),
  scheduled_date date,
  end_date       date,
  description    text,
  scope          text DEFAULT 'cohort' CHECK (scope IN ('cohort','society')),
  cohort_id      uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_appointments_active ON practice_appointments(is_active, scheduled_date);
CREATE INDEX idx_appointments_cohort ON practice_appointments(cohort_id);

-- user_practice_vows ⭐ 核心（current_status 仅管理者可见·师兄端不显；Edge cron 计算）
CREATE TABLE user_practice_vows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source              text NOT NULL CHECK (source IN ('auto','custom')),
  template_id         uuid REFERENCES practice_templates(id) ON DELETE SET NULL,
  cohort_id           uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  event_id            uuid REFERENCES events(id) ON DELETE SET NULL,
  appointment_id      uuid REFERENCES practice_appointments(id) ON DELETE SET NULL,
  -- 集体可见性：报数/集体回向仅算 true（密法已废→无 auto-false；恒默认 true·077）
  share_to_collective boolean DEFAULT true,
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  custom_name         text,
  target_count        int,
  target_period       text NOT NULL CHECK (target_period IN ('lifetime','until_complete','daily','weekly')),
  daily_target        int CHECK (daily_target IS NULL OR daily_target > 0),
  weekly_target       int CHECK (weekly_target IS NULL OR weekly_target > 0),
  min_session_minutes int DEFAULT 30 CHECK (min_session_minutes > 0),
  pace_history        jsonb DEFAULT '[]'::jsonb,
  start_date          date NOT NULL,
  is_early_start      boolean DEFAULT false,
  early_start_reason  text,
  original_end_date   date,
  current_end_date    date,
  current_count       int DEFAULT 0 CHECK (current_count >= 0),
  current_session_count numeric DEFAULT 0 CHECK (current_session_count >= 0),
  -- 状态（系统算·仅管理者可见·师兄端不显；v2.0：Edge cron TS 写，不埋 DB 触发器·规范§七）
  current_status      text DEFAULT 'on_track' CHECK (current_status IN (
                        'on_track','slightly_behind','falling_behind','at_risk','will_overdue','completed','paused'
                      )),
  status_calculated_at timestamptz,
  status_details      jsonb DEFAULT '{}'::jsonb,
  is_required_for_promotion boolean DEFAULT false,
  is_public           boolean DEFAULT true,
  status              text DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  paused_at           timestamptz,
  paused_by           uuid REFERENCES profiles(id),
  paused_reason       text,
  resumed_at          timestamptz,
  completed_at        timestamptz,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT vows_daily_target_required  CHECK (target_period != 'daily'  OR daily_target  IS NOT NULL),
  CONSTRAINT vows_weekly_target_required CHECK (target_period != 'weekly' OR weekly_target IS NOT NULL),
  -- 内加行限时（年限取 cohort 配置·决策122；过期锁定走应用层·#190）；发愿须有终点或终生
  CONSTRAINT vows_must_have_terminus CHECK (current_end_date IS NOT NULL OR target_period = 'lifetime')
);
CREATE INDEX idx_user_practice_vows_user ON user_practice_vows(user_id, status);
CREATE INDEX idx_user_practice_vows_practice ON user_practice_vows(practice_id);
CREATE INDEX idx_user_practice_vows_cohort ON user_practice_vows(cohort_id);
CREATE INDEX idx_user_practice_vows_status ON user_practice_vows(current_status) WHERE status = 'active';
CREATE TRIGGER user_practice_vows_updated_at_trigger
  BEFORE UPDATE ON user_practice_vows FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- vows_protect_status：师兄不可改 current_status 等状态字段；不可改自己 auto 愿的 due_date（场景6 主麦把关）
CREATE OR REPLACE FUNCTION vows_protect_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_system_admin() THEN
    NEW.current_status      := OLD.current_status;
    NEW.status_calculated_at := OLD.status_calculated_at;
    NEW.status_details      := OLD.status_details;
  END IF;
  IF OLD.source = 'auto' AND auth.uid() = OLD.user_id THEN
    NEW.current_end_date  := OLD.current_end_date;
    NEW.original_end_date := OLD.original_end_date;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vows_protect_status_trigger
  BEFORE UPDATE ON user_practice_vows FOR EACH ROW EXECUTE FUNCTION vows_protect_status();

-- 主麦/admin 改师兄 due_date 自动 audit（§12.5）
CREATE OR REPLACE FUNCTION vow_due_date_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_end_date IS DISTINCT FROM OLD.current_end_date
     AND auth.uid() IS NOT NULL AND NEW.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'vow_due_date_changed', 'user_practice_vows', NEW.id,
      jsonb_build_object('subject_user_id', NEW.user_id, 'practice_id', NEW.practice_id,
                         'old_end_date', OLD.current_end_date, 'new_end_date', NEW.current_end_date));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vow_due_date_audit_trigger
  AFTER UPDATE OF current_end_date ON user_practice_vows FOR EACH ROW EXECUTE FUNCTION vow_due_date_audit();

-- practice_logs · 打卡（强归属 vow；审核态 is_confirmed；补录禁未来）
CREATE TABLE practice_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vow_id              uuid NOT NULL REFERENCES user_practice_vows(id) ON DELETE CASCADE,
  count               int CHECK (count IS NULL OR count > 0),
  duration_minutes    int CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  session_count       numeric CHECK (session_count IS NULL OR session_count >= 0),
  session_attempt     int DEFAULT 1 CHECK (session_attempt > 0),
  practice_content_id uuid REFERENCES practice_contents(id) ON DELETE SET NULL,
  reflection          text,
  reflection_at       timestamptz,
  log_date            date NOT NULL DEFAULT CURRENT_DATE,
  log_time            time,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  is_confirmed        boolean DEFAULT false,
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES profiles(id),
  CONSTRAINT logs_has_value CHECK (count IS NOT NULL OR duration_minutes IS NOT NULL),
  CONSTRAINT practice_logs_no_future_date CHECK (log_date <= CURRENT_DATE)
);
CREATE INDEX idx_practice_logs_user_date ON practice_logs(user_id, log_date DESC);
CREATE INDEX idx_practice_logs_vow_date ON practice_logs(vow_id, log_date DESC);
CREATE INDEX idx_practice_logs_content ON practice_logs(practice_content_id);
CREATE INDEX idx_practice_logs_unconfirmed ON practice_logs(user_id) WHERE is_confirmed = false;

-- §12.2 打卡 → 愿 current_count/session_count 累加（数据派生·原子·留 DB）
CREATE OR REPLACE FUNCTION practice_logs_update_vow_progress()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_practice_vows
      SET current_count = current_count + COALESCE(NEW.count, 0),
          current_session_count = current_session_count + COALESCE(NEW.session_count, 0),
          updated_at = now()
      WHERE id = NEW.vow_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE user_practice_vows
      SET current_count = current_count - COALESCE(OLD.count, 0) + COALESCE(NEW.count, 0),
          current_session_count = current_session_count - COALESCE(OLD.session_count, 0) + COALESCE(NEW.session_count, 0),
          updated_at = now()
      WHERE id = NEW.vow_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_practice_vows
      SET current_count = current_count - COALESCE(OLD.count, 0),
          current_session_count = current_session_count - COALESCE(OLD.session_count, 0),
          updated_at = now()
      WHERE id = OLD.vow_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER practice_logs_update_vow_trigger
  AFTER INSERT OR UPDATE OR DELETE ON practice_logs FOR EACH ROW EXECUTE FUNCTION practice_logs_update_vow_progress();

-- §12.3 座次：单笔 ≥30min=1座，<30=0座（不跨记录凑碎片；余数不滚存）
CREATE OR REPLACE FUNCTION practice_logs_calc_session()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duration_minutes IS NOT NULL THEN
    IF TG_OP = 'INSERT' AND NEW.session_count IS NULL THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= 30 THEN 1 ELSE 0 END;
    ELSIF TG_OP = 'UPDATE' AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= 30 THEN 1 ELSE 0 END;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER practice_logs_calc_session_trigger
  BEFORE INSERT OR UPDATE ON practice_logs FOR EACH ROW EXECUTE FUNCTION practice_logs_calc_session();

-- 集体回向聚合视图（只出总和、不出个人；排除 share_to_collective=false）
CREATE VIEW v_event_dedication_totals AS
SELECT v.event_id, v.practice_id, SUM(v.current_count) AS total_count, COUNT(DISTINCT v.user_id) AS participant_count
FROM user_practice_vows v
WHERE v.event_id IS NOT NULL AND v.share_to_collective = true
GROUP BY v.event_id, v.practice_id;

CREATE VIEW v_weekly_dedication_totals AS
SELECT date_trunc('week', l.log_date)::date AS week_start, cm.cohort_id, l.practice_content_id, v.practice_id,
       SUM(COALESCE(l.count,0)) AS total_count, SUM(COALESCE(l.duration_minutes,0)) AS total_minutes,
       COUNT(DISTINCT l.user_id) AS participant_count
FROM practice_logs l
JOIN user_practice_vows v ON v.id = l.vow_id AND v.share_to_collective = true
LEFT JOIN class_members cm ON cm.user_id = l.user_id AND cm.status = 'active'
GROUP BY date_trunc('week', l.log_date), cm.cohort_id, l.practice_content_id, v.practice_id;

-- 补 000030 预留的 FK（practices/practice_contents 此时已建）
ALTER TABLE program_week_practices
  ADD CONSTRAINT program_week_practices_practice_fkey FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE CASCADE,
  ADD CONSTRAINT program_week_practices_content_fkey  FOREIGN KEY (practice_content_id) REFERENCES practice_contents(id) ON DELETE SET NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE practices                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_contents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_guides             ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_recommended_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_practice_vows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_logs               ENABLE ROW LEVEL SECURITY;

-- 元数据：任意登录读 / admin 写（含 practice_templates 代替方案配置·120）
CREATE POLICY practices_select ON practices FOR SELECT TO authenticated USING ( true );
CREATE POLICY practices_write  ON practices FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY practice_contents_select ON practice_contents FOR SELECT TO authenticated USING ( true );
CREATE POLICY practice_contents_write  ON practice_contents FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY practice_guides_select ON practice_guides FOR SELECT TO authenticated USING ( true );
CREATE POLICY practice_guides_write  ON practice_guides FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY practice_templates_select ON practice_templates FOR SELECT TO authenticated USING ( true );
CREATE POLICY practice_templates_write  ON practice_templates FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- cohort_recommended_templates：本班成员/管理员读；admin 写
CREATE POLICY cohort_recommended_templates_select ON cohort_recommended_templates FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
CREATE POLICY cohort_recommended_templates_write ON cohort_recommended_templates FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- events：is_active 任意登录读 / admin 写
CREATE POLICY events_select ON events FOR SELECT TO authenticated USING ( is_active = true OR is_system_admin() );
CREATE POLICY events_write  ON events FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- practice_appointments：按 scope 可见；发起人 INSERT；发起人/admin 改删
CREATE POLICY practice_appointments_select ON practice_appointments FOR SELECT TO authenticated USING (
  scope = 'society'
  OR ( scope = 'cohort' AND cohort_id IS NOT NULL AND ( is_class_member(cohort_id) OR is_class_admin(cohort_id) ) )
  OR initiator_id = auth.uid()
  OR is_system_admin()
);
CREATE POLICY practice_appointments_insert ON practice_appointments FOR INSERT TO authenticated WITH CHECK ( initiator_id = auth.uid() );
CREATE POLICY practice_appointments_update ON practice_appointments FOR UPDATE TO authenticated USING ( initiator_id = auth.uid() OR is_system_admin() ) WITH CHECK ( initiator_id = auth.uid() OR is_system_admin() );
CREATE POLICY practice_appointments_delete ON practice_appointments FOR DELETE TO authenticated USING ( initiator_id = auth.uid() OR is_system_admin() );

-- user_practice_vows：自己 + 本班主麦/爱心(cohort NOT NULL) + admin 读；自己发愿；
--   改 = 自己 OR admin OR 本班主麦/爱心改本班 auto 愿（场景6 宽限 due_date）；删 = admin。current_status 由 trigger 锁。
CREATE POLICY user_practice_vows_select ON user_practice_vows FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR ( cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) )
  OR is_system_admin()
);
CREATE POLICY user_practice_vows_insert ON user_practice_vows FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
CREATE POLICY user_practice_vows_update ON user_practice_vows FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR is_system_admin()
    OR ( source = 'auto' AND cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) )
  )
  WITH CHECK (
    user_id = auth.uid() OR is_system_admin()
    OR ( source = 'auto' AND cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) )
  );
CREATE POLICY user_practice_vows_delete ON user_practice_vows FOR DELETE TO authenticated USING ( is_system_admin() );

-- practice_logs：强归属 vow；自己 + (该 vow 所属班主麦/爱心) + admin 读；自己写(vow 须自己的)；审核态改删
CREATE POLICY practice_logs_select ON practice_logs FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM user_practice_vows v WHERE v.id = practice_logs.vow_id AND v.cohort_id IS NOT NULL AND has_class_role(v.cohort_id, ARRAY['zhumai','aixin']))
  OR is_system_admin()
);
CREATE POLICY practice_logs_insert ON practice_logs FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM user_practice_vows WHERE id = practice_logs.vow_id AND user_id = auth.uid())
);
CREATE POLICY practice_logs_update ON practice_logs FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND is_confirmed = false)
    OR has_class_role((SELECT cohort_id FROM user_practice_vows WHERE id = practice_logs.vow_id), ARRAY['zhumai'])
    OR is_system_admin()
  )
  WITH CHECK (
    (user_id = auth.uid() AND is_confirmed = false)
    OR has_class_role((SELECT cohort_id FROM user_practice_vows WHERE id = practice_logs.vow_id), ARRAY['zhumai'])
    OR is_system_admin()
  );
CREATE POLICY practice_logs_delete ON practice_logs FOR DELETE TO authenticated USING (
  (user_id = auth.uid() AND is_confirmed = false) OR is_system_admin()
);

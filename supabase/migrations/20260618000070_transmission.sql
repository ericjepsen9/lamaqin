-- ============================================================
-- 20260618000070_transmission · 域⑤ 传承（决策124 结构化传承清单·全新加表）
-- T1 transmissions master / T2 必需传承（program 级配） / T3 已得传承（per 师兄·物化）。
-- 灌顶/密法不入（060）。供 admin 查看/升学审核，**不 auto-gate**（017/124 人工判定）。
-- 依赖：000010（programs/profiles/helpers）、000020（courses）。
-- ============================================================

CREATE TABLE transmissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  source_kind       text NOT NULL CHECK (source_kind IN ('course','assembly')),  -- 灌顶/密法不入·060
  related_course_id uuid REFERENCES courses(id) ON DELETE SET NULL,               -- 课程传承挂哪部课（选填）
  description       text,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_transmissions_source ON transmissions(source_kind);

CREATE TABLE program_required_transmissions (
  program_id      uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  transmission_id uuid NOT NULL REFERENCES transmissions(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, transmission_id)
);

CREATE TABLE user_transmissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transmission_id uuid NOT NULL REFERENCES transmissions(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('course_listen','restricted_check','assembly','proxy_recognize')),
  obtained_at     date,
  recorded_by     uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, transmission_id)
);
CREATE INDEX idx_user_transmissions_user ON user_transmissions(user_id);

-- A3 视图：每师兄 已得(T3) vs 必需(T2) → ✓/✗（供 admin 查看/升学审核·不 auto-gate）
-- security_invoker：随查询者权限走基表 RLS（user_transmissions 师兄只见自己·#193）
CREATE VIEW v_advancement_transmissions WITH (security_invoker = true) AS
SELECT cm.user_id, p.id AS program_id, prt.transmission_id,
       (ut.id IS NOT NULL) AS obtained
FROM class_members cm
JOIN cohorts c ON c.id = cm.cohort_id
JOIN programs p ON p.id = c.program_id
JOIN program_required_transmissions prt ON prt.program_id = p.id
LEFT JOIN user_transmissions ut ON ut.user_id = cm.user_id AND ut.transmission_id = prt.transmission_id;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE transmissions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_required_transmissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_transmissions             ENABLE ROW LEVEL SECURITY;

-- transmissions / 必需传承：任意登录读（清单展示）/ admin 写
CREATE POLICY transmissions_select ON transmissions FOR SELECT TO authenticated USING ( true );
CREATE POLICY transmissions_write  ON transmissions FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY prt_select ON program_required_transmissions FOR SELECT TO authenticated USING ( true );
CREATE POLICY prt_write  ON program_required_transmissions FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- user_transmissions：访问规则 = 自己 + 该师兄所在班主麦/爱心 + admin 读；写 = admin（人工录入/系统派生·124）
CREATE POLICY user_transmissions_select ON user_transmissions FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = user_transmissions.user_id AND ca.user_id = auth.uid() AND ca.role IN ('zhumai','aixin')
  )
);
CREATE POLICY user_transmissions_write ON user_transmissions FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

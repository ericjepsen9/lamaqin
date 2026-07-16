-- ============================================================
-- 20260618000095_advancement · 域⑨ 升学/毕业评定（决策017/123/118/090）
-- 读 5 维聚合（视图）+ advancement_records 留痕；**人工判定·不 auto-gate**（017/123）。
-- 视图 WITH (security_invoker=true)：随查询者权限走基表 RLS，师兄看不到他人（#193）。
-- 依赖：000010/000020/000050/000060/000070/000080。
-- ============================================================

-- advancement_records · 升学/毕业留痕（人工判定结果）
CREATE TABLE advancement_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  to_cohort_id   uuid REFERENCES cohorts(id) ON DELETE SET NULL,   -- NULL=毕业
  decision       text NOT NULL CHECK (decision IN ('advanced','graduated','held_back','other')),
  decided_by     uuid REFERENCES profiles(id),                     -- 教学部/admin
  basis          text,
  decided_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_advancement_records_user ON advancement_records(user_id, decided_at DESC);

-- v_advancement_5dim · 升学评定面板（4 可量化维聚合；发心人工不入·124）。判定仍人工·不 auto-gate。
CREATE VIEW v_advancement_5dim WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id AND vt.obtained) AS transmissions_obtained,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id)                  AS transmissions_required,
  (SELECT count(*) FROM study_records sr WHERE sr.user_id = p.id AND sr.study_type = 'group_attend') AS attendance_count,
  (SELECT COALESCE(sum(v.current_count),0) FROM user_practice_vows v WHERE v.user_id = p.id)     AS practice_total,
  (SELECT count(*) FROM exam_grades e WHERE e.user_id = p.id AND e.is_pass)                      AS exams_passed
FROM profiles p;

-- ============================================================
-- RLS（advancement_records：管理端 + 师兄看自己结果·不见他人#193）
-- ============================================================
ALTER TABLE advancement_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY advancement_records_select ON advancement_records FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = advancement_records.user_id AND ca.user_id = auth.uid() AND ca.role IN ('zhumai','aixin')
  )
);
CREATE POLICY advancement_records_write ON advancement_records FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

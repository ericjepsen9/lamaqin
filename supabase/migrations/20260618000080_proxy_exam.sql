-- ============================================================
-- 20260618000080_proxy_exam · 域④ 代行记录（121）+ 考试成绩（125）· 全新加表
-- 依赖：000010/000015（profiles/helpers/audit_logs）、000060（practices）、000010（programs）。
-- ============================================================

-- proxy_action_records · 代行记录（替代/追溯认可/豁免；polymorphic target；双方可见）
CREATE TABLE proxy_action_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,   -- 受益师兄
  action_type         text NOT NULL CHECK (action_type IN ('substitute','recognize','exempt')),
  admin_id            uuid REFERENCES profiles(id),                              -- 经办（admin/辅导员）
  target_kind         text NOT NULL CHECK (target_kind IN ('vow','lesson','transmission','exam','advancement','other')),
  target_ref          uuid,                                                      -- 对应 uuid（如 vow_id）；非 uuid 目标用 target_note
  target_note         text,
  substitute_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,       -- 替代时
  substitute_count    int CHECK (substitute_count IS NULL OR substitute_count > 0),
  reason              text NOT NULL,                                             -- 必填
  basis               text,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX idx_proxy_action_records_user ON proxy_action_records(user_id, created_at DESC);
CREATE INDEX idx_proxy_action_records_target ON proxy_action_records(target_kind, target_ref);

-- exam_grades · 考试成绩（线下考试·后台录入·125）
-- ⚠️ 2026-07-12 订正:is_pass 从未真是"人工set"——App 端一直是按分数与固定阈值(60)自动算,
--   只是阈值是占位、没按大纲真实的"出勤次数+开卷闭卷"分档。20260712000100_exam_format.sql
--   把这条改成按大纲真实规则算(见该文件头注)。
CREATE TABLE exam_grades (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id   uuid REFERENCES programs(id) ON DELETE SET NULL,   -- 锚定专业（123）
  exam_name    text NOT NULL,                                     -- 科目/场次
  score        numeric,
  is_pass      boolean,                                           -- 按大纲规则自动算(见 20260712000100)
  recorded_by  uuid REFERENCES profiles(id),                      -- admin/学科管理员
  recorded_at  timestamptz DEFAULT now(),
  notes        text
);
CREATE INDEX idx_exam_grades_user ON exam_grades(user_id, recorded_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE proxy_action_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_grades          ENABLE ROW LEVEL SECURITY;

-- proxy_action_records：访问规则 = 受益师兄(自己) + 该师兄所在班主麦/爱心 + admin 读；写 = admin/辅导员（代行=管理动作，另写 audit）
CREATE POLICY proxy_action_records_select ON proxy_action_records FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = proxy_action_records.user_id AND ca.user_id = auth.uid() AND ca.role IN ('zhumai','aixin')
  )
);
CREATE POLICY proxy_action_records_write ON proxy_action_records FOR ALL TO authenticated
  USING (
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
      WHERE cm.user_id = proxy_action_records.user_id AND ca.user_id = auth.uid() AND ca.role = 'zhumai'
    )
  )
  WITH CHECK (
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
      WHERE cm.user_id = proxy_action_records.user_id AND ca.user_id = auth.uid() AND ca.role = 'zhumai'
    )
  );

-- exam_grades：访问规则 = 师兄看自己成绩 + 该师兄所在班主麦 + admin 读；写 = admin（后台录入·125）
CREATE POLICY exam_grades_select ON exam_grades FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = exam_grades.user_id AND ca.user_id = auth.uid() AND ca.role = 'zhumai'
  )
);
CREATE POLICY exam_grades_write ON exam_grades FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

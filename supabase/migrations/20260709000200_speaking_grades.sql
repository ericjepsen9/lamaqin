-- 波D:讲考(决策067/080)——① speaking_sessions 补可选挂共修场次列;② 新建 speaking_evaluations
-- 存"等级评价"(通过/待加强,选填,辅导员填,仅管理端可见·延后-18已闭"师兄端不显")。
-- 三态(主讲speaking_present/提问speaking_question/旁听speaking_observe)复用既有 study_records,不改动。

ALTER TABLE speaking_sessions
  ADD COLUMN IF NOT EXISTS group_session_id uuid REFERENCES group_sessions(id) ON DELETE SET NULL;
COMMENT ON COLUMN speaking_sessions.group_session_id IS
  '决策080:讲考可选关联共修场次(在哪次共修讲的),留空=独立记录(如线下单独讲考)。';

-- speaking_evaluations · 讲考等级评价(仅主讲者·决策067"主讲者可附等级评价,旁听者照记")
CREATE TABLE speaking_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_record_id uuid NOT NULL UNIQUE REFERENCES study_records(id) ON DELETE CASCADE,
  grade           text NOT NULL CHECK (grade IN ('pass','needs_improvement')),
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_speaking_evaluations_record ON speaking_evaluations(study_record_id);
CREATE TRIGGER speaking_evaluations_updated_at_trigger
  BEFORE UPDATE ON speaking_evaluations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE speaking_evaluations ENABLE ROW LEVEL SECURITY;

-- 读 = 本班主麦/爱心/admin(与 study_records_select 同一批角色);⚠️ 不含 user_id=auth.uid() 分支——
--   评价仅管理端可见,师兄端(即便是本人)不显(决策067"克制"·延后-18 2026-06-15已闭)。
CREATE POLICY speaking_evaluations_select ON speaking_evaluations FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM study_records sr WHERE sr.id = study_record_id
    AND (has_class_role(sr.cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin())
  )
);
-- 写 = 本班主麦/admin(与 speaking_sessions_write 同一批角色,aixin 不写讲考);且只准挂在【主讲】记录上
-- (决策067"主讲者可附等级评价(选填);旁听者照记"——提问/旁听没有评价这回事,DB 层跟 App 层双守)。
CREATE POLICY speaking_evaluations_write ON speaking_evaluations FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM study_records sr WHERE sr.id = study_record_id
    AND (has_class_role(sr.cohort_id, ARRAY['zhumai']) OR is_system_admin())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM study_records sr WHERE sr.id = study_record_id AND sr.study_type = 'speaking_present'
    AND (has_class_role(sr.cohort_id, ARRAY['zhumai']) OR is_system_admin())
  )
);

-- 补缝:决策067要点4"辅导员可改本班讲考记录"+094出勤后台录入——主麦录错人后要能【清除】记录,
-- 但原 study_records_delete 只允许(本人未确认 OR admin),主麦的 DELETE 会静默 0 行(RLS 删除不报错,
-- 界面显示保存成功、记录却还在——出勤点名页"清空"同样中招)。补一条限定范围的 DELETE 策略:
-- 只放主麦删【本班的出勤/讲考类】记录(与其 INSERT 权限同范围),listen 等师兄自报类不放。
CREATE POLICY study_records_delete_manager ON study_records FOR DELETE TO authenticated USING (
  (study_type LIKE 'group_%' OR study_type LIKE 'speaking_%')
  AND has_class_role(cohort_id, ARRAY['zhumai'])
);

-- 补审计:§12.1"管理者改师兄记录→写audit_logs"原设计只挂 AFTER UPDATE(因原 delete 策略只放
-- 本人未确认/admin,管理者本无DELETE他人记录的能力)。上面新开的 study_records_delete_manager 让
-- zhumai 首次能删他人(含已确认)记录,若不补 DELETE 审计,已审核的出勤/讲考可被无痕抹除、无法追责。
CREATE OR REPLACE FUNCTION study_records_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF auth.uid() IS NOT NULL AND OLD.user_id != auth.uid() THEN
      INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
      VALUES (auth.uid(), 'study_record_delete', 'study_records', OLD.id,
        jsonb_build_object('subject_user_id', OLD.user_id, 'cohort_id', OLD.cohort_id,
                           'lesson_id', OLD.lesson_id, 'study_type', OLD.study_type, 'was_confirmed', OLD.is_confirmed));
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NEW.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'study_record_override', 'study_records', NEW.id,
      jsonb_build_object('subject_user_id', NEW.user_id, 'cohort_id', NEW.cohort_id,
                         'lesson_id', NEW.lesson_id, 'old_study_type', OLD.study_type, 'new_study_type', NEW.study_type));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER study_records_audit_delete_trigger
  AFTER DELETE ON study_records FOR EACH ROW EXECUTE FUNCTION study_records_audit();

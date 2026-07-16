-- ============================================================
-- 20260618000015_audit_and_identity_functions
-- audit_logs（§6.10，提前到此：多域审计写入依赖它，只 ref profiles）
-- + 域① 写 audit 的过程函数：switch_primary_cohort（决策131/134 重写）、promote_member_role（决策040/134 新）
-- 依赖：000010（profiles/class_members/helpers/profiles_protect_status bypass）。
-- ============================================================

-- ------------------------------------------------------------
-- audit_logs · 审计日志（不可篡改：无 UPDATE/DELETE 策略）
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action              text NOT NULL,
  target_type         text,
  target_id           uuid,
  metadata            jsonb,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- 访问规则：仅 admin 可看；任意登录可写自己的（应用层产生）；不可改/删
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated USING ( is_system_admin() );
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );

-- ------------------------------------------------------------
-- switch_primary_cohort · 切主班
-- ⭐ v2.0 决策131/134：用户本人（限已入班）+ admin；移除原"任意主麦代切"。
-- 只动 class_members.is_primary（主班真源）；事务内两步切换避免撞 uniq_class_members_primary。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.switch_primary_cohort(
  p_user_id uuid,
  p_new_primary_cohort_id uuid
) RETURNS class_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id uuid := auth.uid();
  result class_members;
BEGIN
  -- 权限：用户本人 或 系统管理员（决策134：不保留主麦代切）
  IF NOT (is_system_admin() OR caller_id = p_user_id) THEN
    RAISE EXCEPTION '无权切换主班：仅用户本人或系统管理员';
  END IF;

  -- 限已入班：目标必须是该师兄已加入且 active 的班
  IF NOT EXISTS (
    SELECT 1 FROM class_members
    WHERE user_id = p_user_id AND cohort_id = p_new_primary_cohort_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION '用户 % 不在 active 班级 %（只能在已入的班里挑主班）', p_user_id, p_new_primary_cohort_id;
  END IF;

  UPDATE class_members SET is_primary = false
    WHERE user_id = p_user_id AND is_primary = true;
  UPDATE class_members SET is_primary = true
    WHERE user_id = p_user_id AND cohort_id = p_new_primary_cohort_id
    RETURNING * INTO result;

  INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
  VALUES (caller_id, 'switch_primary_cohort', 'class_members', result.cohort_id,
          jsonb_build_object('subject_user_id', p_user_id, 'new_primary_cohort', p_new_primary_cohort_id));
  RETURN result;
END $$;

-- ------------------------------------------------------------
-- promote_member_role · 转正（auditor → formal）
-- ⭐ v2.0 决策040/134：本班主麦/admin 可转正；不可降级；首次转正发学号（只发一次）。
-- 取代原 generate_student_id（挂 profiles.enrollment→formal 的触发器已废·决策133/134）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_member_role(
  p_cohort_id uuid,
  p_user_id uuid
) RETURNS class_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id uuid := auth.uid();
  result class_members;
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
BEGIN
  -- 权限：本班主麦 或 系统管理员（决策040）
  IF NOT (is_system_admin() OR has_class_role(p_cohort_id, ARRAY['zhumai'])) THEN
    RAISE EXCEPTION '无权转正：仅本班主麦或系统管理员';
  END IF;

  -- auditor → formal（不可降级；已 formal 则报错，避免重复发号）
  UPDATE class_members SET member_role = 'formal'
    WHERE cohort_id = p_cohort_id AND user_id = p_user_id AND member_role = 'auditor'
    RETURNING * INTO result;
  IF NOT FOUND THEN
    RAISE EXCEPTION '成员不存在或已是正式：user=% cohort=%', p_user_id, p_cohort_id;
  END IF;

  -- 决策134：首次转正发学号（无号才发；全局唯一、只发一次；规则 {当年}{4位流水}）
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND student_id IS NOT NULL) THEN
    SELECT COALESCE(MAX(NULLIF(substring(student_id FROM 5), '')::int), 0) + 1
      INTO v_seq
      FROM profiles
      WHERE student_id ~ ('^' || v_year::text || '\d+$');
    -- 经授权写 student_id（profiles_protect_status 放行此事务，见 000010）
    PERFORM set_config('app.allow_protected_write', 'on', true);
    UPDATE profiles SET student_id = v_year::text || lpad(v_seq::text, 4, '0')
      WHERE id = p_user_id AND student_id IS NULL;
    PERFORM set_config('app.allow_protected_write', 'off', true);
  END IF;

  INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
  VALUES (caller_id, 'promote_member_role', 'class_members', p_cohort_id,
          jsonb_build_object('subject_user_id', p_user_id, 'cohort_id', p_cohort_id, 'new_role', 'formal'));
  RETURN result;
END $$;
-- ⚠️ 并发：同年同秒发号可能撞 student_id UNIQUE → 前端/admin 重试；量大可改 sequence。

GRANT EXECUTE ON FUNCTION
  public.switch_primary_cohort(uuid, uuid),
  public.promote_member_role(uuid, uuid)
TO authenticated;

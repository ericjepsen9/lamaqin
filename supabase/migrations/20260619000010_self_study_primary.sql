-- ============================================================
-- 20260619000010_self_study_primary · 决策144 当前主修上下文（主修自学专业）
-- 给 user_self_study_programs 加 is_primary（镜像 class_members.is_primary 主班真源）；
-- + 唯一约束（每人 ≤1 主修自学）+ set_primary_self_study_program() RPC（镜像 switch_primary_cohort·决策131/134）。
-- 用途：纯自学用户（无班·决策119）的“当前主修上下文”锚点 → 驱动 首页4卡 / 快速计数默认愿 / 第5 tab（自学）。
--   在班用户主修恒=主班（决策144），本字段只对无班自学用户起锚定作用。
-- 依赖：000030（user_self_study_programs）、000015（audit_logs / switch_primary_cohort 范式）、000010（is_system_admin）。
-- additive 迁移：不改基线表语义；PM 2026-06-19 同意改 db（决策144/145）。
-- ============================================================

ALTER TABLE user_self_study_programs
  ADD COLUMN is_primary boolean NOT NULL DEFAULT false;

-- 回填：为已有自学用户把“最早 active 的自学专业”设为主修（首个默认主修），每人恰一个
UPDATE user_self_study_programs u SET is_primary = true
WHERE u.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM user_self_study_programs p WHERE p.user_id = u.user_id AND p.is_primary = true)
  AND u.id = (
    SELECT p2.id FROM user_self_study_programs p2
    WHERE p2.user_id = u.user_id AND p2.status = 'active'
    ORDER BY p2.start_date ASC, p2.created_at ASC, p2.id ASC
    LIMIT 1
  );

-- 每人最多一个主修自学专业（镜像 uniq_class_members_primary）
CREATE UNIQUE INDEX uniq_user_self_study_primary
  ON user_self_study_programs(user_id) WHERE is_primary = true;

-- ------------------------------------------------------------
-- set_primary_self_study_program · 设主修自学专业（镜像 switch_primary_cohort）
-- 权限：用户本人 或 系统管理员（决策131/134；不含他人代切）。
-- 限已注册且 active 的自学专业；事务内两步切换避免撞 uniq；写 audit_logs。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_primary_self_study_program(
  p_user_id uuid,
  p_new_primary_program_id uuid
) RETURNS user_self_study_programs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id uuid := auth.uid();
  result user_self_study_programs;
BEGIN
  -- 权限：用户本人 或 系统管理员
  IF NOT (is_system_admin() OR caller_id = p_user_id) THEN
    RAISE EXCEPTION '无权设主修自学专业：仅用户本人或系统管理员';
  END IF;

  -- 限已注册：目标必须是该用户已注册且 active 的自学专业
  IF NOT EXISTS (
    SELECT 1 FROM user_self_study_programs
    WHERE user_id = p_user_id AND program_id = p_new_primary_program_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION '用户 % 未在 active 自学专业 %（只能在已注册的自学专业里挑主修）', p_user_id, p_new_primary_program_id;
  END IF;

  UPDATE user_self_study_programs SET is_primary = false
    WHERE user_id = p_user_id AND is_primary = true;
  UPDATE user_self_study_programs SET is_primary = true
    WHERE user_id = p_user_id AND program_id = p_new_primary_program_id
    RETURNING * INTO result;

  INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
  VALUES (caller_id, 'set_primary_self_study_program', 'user_self_study_programs', result.id,
          jsonb_build_object('subject_user_id', p_user_id, 'new_primary_program', p_new_primary_program_id));
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION
  public.set_primary_self_study_program(uuid, uuid)
TO authenticated;

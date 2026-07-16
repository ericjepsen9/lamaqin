-- ============================================================
-- 20260628000020 · 功课/班级愿自动发放(决策012 / 010 / 073 / 086 / 122 对齐)
-- ------------------------------------------------------------
-- 决策012:愿模板 program 为根、cohort 可覆盖。自学按 program 默认建;班级先 cohort 覆盖、
--   无则 fallback program 默认(逐「修法」fallback)。
-- 决策010:非限时 auto 愿入班即建,起修日 = 入班当天(class_members.joined_at)。
-- 决策073/086/122:内加行 = 限时愿(practice_templates.is_time_limited);梯次起修 = 开班日 +
--   starts_offset_days;截止 = 起修 + 建班配置年限(cohorts.neijiaxing_lock_years,默认4);
--   仅 admin 延期 / 过期补录锁定(锁定走应用层 #190)。
-- 落地表(冻结基线,不新建):practice_templates(applies_to_programs = 该专业默认)
--   + cohort_recommended_templates(binding='auto' = 本班覆盖)→ 实例化进 user_practice_vows(source='auto')。
-- 发愿时机(2026-06-28 修:从 DB 触发器改为【应用层显式调用】)——理由:
--   ① 项目原则「业务逻辑别埋 DB 触发器」(规范§七,与 current_status 走 Edge cron 同源);
--   ② 触发器里吞异常会「学员入了班却悄悄没愿、没人知道」。改为应用层调用,失败可见、可控、好查。
--   路径:管理端「加学员」后调 provision_cohort_vows(本班幂等补全);「功课配置 → 同步发放」按钮亦调它。
--   ⚠️ 将来接「自助报名 / 自学报名」入口时,各自在写库后显式调 provision_cohort_vows / provision_selfstudy_vows。
-- 幂等:同 (user, cohort, practice, source='auto') 已有愿则不重建 → 可随时重跑。
-- 为何 SECURITY DEFINER:user_practice_vows 的 INSERT RLS = (user_id = auth.uid()),管理员无法替学员写;
--   以 definer(表 owner)身份绕过。
-- ============================================================

-- ── C 段:模板带「限时」标记(决策086;内加行从硬编码降为模板数据实例)──
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS is_time_limited boolean NOT NULL DEFAULT false;

-- ── 单个学员发愿(班级):program 默认 / cohort 覆盖 逐「修法」fallback ──
CREATE OR REPLACE FUNCTION provision_member_vows(p_user_id uuid, p_cohort_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_cohort cohorts;
  v_join   date;
  v_created integer := 0;
BEGIN
  SELECT * INTO v_cohort FROM cohorts WHERE id = p_cohort_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT joined_at::date INTO v_join FROM class_members WHERE cohort_id = p_cohort_id AND user_id = p_user_id;
  v_join := COALESCE(v_join, CURRENT_DATE);

  WITH cohort_over AS (   -- 本班覆盖:每个修法取一条(按 display_order)
    SELECT DISTINCT ON (t.practice_id) t.*
    FROM cohort_recommended_templates crt
    JOIN practice_templates t ON t.id = crt.template_id AND t.is_active
    WHERE crt.cohort_id = p_cohort_id AND crt.binding = 'auto'
    ORDER BY t.practice_id, crt.display_order
  ),
  prog_default AS (       -- 专业默认:每个修法取一条
    SELECT DISTINCT ON (t.practice_id) t.*
    FROM practice_templates t
    WHERE t.is_active AND t.applies_to_programs @> ARRAY[v_cohort.program_id]::uuid[]
    ORDER BY t.practice_id, t.display_order
  ),
  eff AS (                -- 逐项 fallback:有覆盖用覆盖,否则用专业默认
    SELECT * FROM cohort_over
    UNION ALL
    SELECT * FROM prog_default p WHERE p.practice_id NOT IN (SELECT practice_id FROM cohort_over)
  )
  INSERT INTO user_practice_vows (
    user_id, source, template_id, cohort_id, practice_id,
    target_count, target_period, daily_target, weekly_target,
    start_date, original_end_date, current_end_date,
    is_required_for_promotion, share_to_collective, status
  )
  SELECT
    p_user_id, 'auto', e.id, p_cohort_id, e.practice_id,
    e.target_count, e.target_period, e.default_daily_target, e.default_weekly_target,
    -- 起修:限时→梯次(开班+偏移);非限时→入班当天(决策010)
    CASE WHEN e.is_time_limited THEN v_cohort.start_date + COALESCE(e.starts_offset_days, 0) ELSE v_join END,
    -- 截止:终生→NULL;限时→梯起+年限;其它→入班+duration(无则兜底年限)
    CASE
      WHEN e.target_period = 'lifetime' THEN NULL
      WHEN e.is_time_limited THEN (v_cohort.start_date + COALESCE(e.starts_offset_days, 0)) + COALESCE(v_cohort.neijiaxing_lock_years, 4) * 365
      WHEN e.duration_days IS NOT NULL THEN v_join + e.duration_days
      ELSE v_join + COALESCE(v_cohort.neijiaxing_lock_years, 4) * 365
    END,
    CASE
      WHEN e.target_period = 'lifetime' THEN NULL
      WHEN e.is_time_limited THEN (v_cohort.start_date + COALESCE(e.starts_offset_days, 0)) + COALESCE(v_cohort.neijiaxing_lock_years, 4) * 365
      WHEN e.duration_days IS NOT NULL THEN v_join + e.duration_days
      ELSE v_join + COALESCE(v_cohort.neijiaxing_lock_years, 4) * 365
    END,
    true, true, 'active'
  FROM eff e
  WHERE NOT EXISTS (
    SELECT 1 FROM user_practice_vows v
    WHERE v.user_id = p_user_id AND v.cohort_id = p_cohort_id AND v.practice_id = e.practice_id AND v.source = 'auto'
  );
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END $$;

-- ── 单个学员发愿(自学):仅 program 默认(无 cohort 覆盖)──
CREATE OR REPLACE FUNCTION provision_selfstudy_vows(p_user_id uuid, p_program_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_start date;
  v_created integer := 0;
BEGIN
  -- 权限闸:只能为本人(或 admin)发放自学愿,防任意登录替他人发愿。
  IF NOT (p_user_id = auth.uid() OR is_system_admin()) THEN
    RAISE EXCEPTION '无权限:只能为本人发放自学愿';
  END IF;
  SELECT start_date INTO v_start FROM user_self_study_programs WHERE user_id = p_user_id AND program_id = p_program_id;
  v_start := COALESCE(v_start, CURRENT_DATE);

  INSERT INTO user_practice_vows (
    user_id, source, template_id, cohort_id, practice_id,
    target_count, target_period, daily_target, weekly_target,
    start_date, original_end_date, current_end_date,
    is_required_for_promotion, share_to_collective, status
  )
  SELECT
    p_user_id, 'auto', t.id, NULL, t.practice_id,
    t.target_count, t.target_period, t.default_daily_target, t.default_weekly_target,
    CASE WHEN t.is_time_limited THEN v_start + COALESCE(t.starts_offset_days, 0) ELSE v_start END,
    CASE
      WHEN t.target_period = 'lifetime' THEN NULL
      WHEN t.is_time_limited THEN (v_start + COALESCE(t.starts_offset_days, 0)) + 4 * 365
      WHEN t.duration_days IS NOT NULL THEN v_start + t.duration_days
      ELSE v_start + 4 * 365
    END,
    CASE
      WHEN t.target_period = 'lifetime' THEN NULL
      WHEN t.is_time_limited THEN (v_start + COALESCE(t.starts_offset_days, 0)) + 4 * 365
      WHEN t.duration_days IS NOT NULL THEN v_start + t.duration_days
      ELSE v_start + 4 * 365
    END,
    true, true, 'active'
  FROM (
    SELECT DISTINCT ON (practice_id) *
    FROM practice_templates
    WHERE is_active AND applies_to_programs @> ARRAY[p_program_id]::uuid[]
    ORDER BY practice_id, display_order
  ) t
  WHERE NOT EXISTS (
    SELECT 1 FROM user_practice_vows v
    WHERE v.user_id = p_user_id AND v.cohort_id IS NULL AND v.practice_id = t.practice_id AND v.source = 'auto'
  );
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END $$;

-- ── 全班补发 / 同步(管理端 RPC)──
CREATE OR REPLACE FUNCTION provision_cohort_vows(p_cohort_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_total integer := 0;
  v_m record;
BEGIN
  IF NOT (is_system_admin() OR has_class_role(p_cohort_id, ARRAY['zhumai'])) THEN
    RAISE EXCEPTION '无权限:仅管理员或本班辅导员可发放班级愿';
  END IF;
  FOR v_m IN SELECT user_id FROM class_members WHERE cohort_id = p_cohort_id AND status = 'active' LOOP
    v_total := v_total + provision_member_vows(v_m.user_id, p_cohort_id);
  END LOOP;
  RETURN v_total;
END $$;
-- 授权:仅放开两个【带权限闸】的入口给 authenticated:
--   provision_cohort_vows(内部 admin/主麦闸) + provision_selfstudy_vows(本人/admin闸)。
--   provision_member_vows【不授权】——它无外部闸,只由 provision_cohort_vows 以 definer 身份内部调用
--   (SECURITY DEFINER 内部调用按 owner 鉴权,不需 caller 有 EXECUTE)。
GRANT EXECUTE ON FUNCTION provision_cohort_vows(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION provision_selfstudy_vows(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION provision_member_vows(uuid, uuid) FROM PUBLIC, authenticated;

-- 不建触发器(见文件头):发愿由应用层在「加学员 / 同步发放 / 将来的报名入口」显式调用 cohort/selfstudy 两个入口。

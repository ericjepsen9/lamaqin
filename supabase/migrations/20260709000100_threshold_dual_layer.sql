-- ============================================================
-- 波C·座次门槛(min_session_minutes)双层方案(2026-07-08 PM 裁决:双层+per-vow仅admin)
--
-- 背景:该字段此前只存在于 user_practice_vows(愿),practice_templates(模板)完全没有——
--   发愿时无论怎么配都只能继承表级 DEFAULT 30(见 20260709000000_wave_a_schema.sql 的注释与
--   实际代码不一致:注释写"愿表+模板表都收"，实际模板表压根没这列，此处一并订正说明，不改老迁移)。
--   design_v2_decisions/requirements_master/schema_phase1 全文核实：除 PD-2 判例外无任何文档
--   规定"admin该在哪层配置"，是从未裁决过的实施空白，本轮由 PM 直接拍板。
--
-- 方案:①模板加默认门槛列(新发的愿继承它，NULL=沿用 30)；②per-vow 个别覆写入口=仅 admin
--   (与"设宽限"同类操作，但权限比宽限更紧——宽限已开放本班zhumai/aixin，门槛因直接影响判座
--   收紧到仅admin，靠触发器列级锁定，不能只在前端不出按钮)。
-- 两层不冲突:PD-2 已定运行时按愿上字段走(+快照 min_session_minutes_at_log 不追溯历史)，
--   模板只是"新发愿的默认值来源"。
-- ============================================================

ALTER TABLE practice_templates
  ADD COLUMN IF NOT EXISTS default_min_session_minutes int
    CHECK (default_min_session_minutes IS NULL OR default_min_session_minutes >= 30);

-- 发愿函数接入新字段(CREATE OR REPLACE，其余逻辑原样不动:幂等 WHERE NOT EXISTS、权限闸、GET DIAGNOSTICS)
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

  WITH cohort_over AS (
    SELECT DISTINCT ON (t.practice_id) t.*
    FROM cohort_recommended_templates crt
    JOIN practice_templates t ON t.id = crt.template_id AND t.is_active
    WHERE crt.cohort_id = p_cohort_id AND crt.binding = 'auto'
    ORDER BY t.practice_id, crt.display_order
  ),
  prog_default AS (
    SELECT DISTINCT ON (t.practice_id) t.*
    FROM practice_templates t
    WHERE t.is_active AND t.applies_to_programs @> ARRAY[v_cohort.program_id]::uuid[]
    ORDER BY t.practice_id, t.display_order
  ),
  eff AS (
    SELECT * FROM cohort_over
    UNION ALL
    SELECT * FROM prog_default p WHERE p.practice_id NOT IN (SELECT practice_id FROM cohort_over)
  )
  INSERT INTO user_practice_vows (
    user_id, source, template_id, cohort_id, practice_id,
    target_count, target_period, daily_target, weekly_target, min_session_minutes,
    start_date, original_end_date, current_end_date,
    is_required_for_promotion, share_to_collective, status
  )
  SELECT
    p_user_id, 'auto', e.id, p_cohort_id, e.practice_id,
    e.target_count, e.target_period, e.default_daily_target, e.default_weekly_target,
    COALESCE(e.default_min_session_minutes, 30),
    CASE WHEN e.is_time_limited THEN v_cohort.start_date + COALESCE(e.starts_offset_days, 0) ELSE v_join END,
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

CREATE OR REPLACE FUNCTION provision_selfstudy_vows(p_user_id uuid, p_program_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_start date;
  v_created integer := 0;
BEGIN
  IF NOT (p_user_id = auth.uid() OR is_system_admin()) THEN
    RAISE EXCEPTION '无权限:只能为本人发放自学愿';
  END IF;
  SELECT start_date INTO v_start FROM user_self_study_programs WHERE user_id = p_user_id AND program_id = p_program_id;
  v_start := COALESCE(v_start, CURRENT_DATE);

  INSERT INTO user_practice_vows (
    user_id, source, template_id, cohort_id, practice_id,
    target_count, target_period, daily_target, weekly_target, min_session_minutes,
    start_date, original_end_date, current_end_date,
    is_required_for_promotion, share_to_collective, status
  )
  SELECT
    p_user_id, 'auto', t.id, NULL, t.practice_id,
    t.target_count, t.target_period, t.default_daily_target, t.default_weekly_target,
    COALESCE(t.default_min_session_minutes, 30),
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

-- per-vow 门槛覆写权限收紧为仅 admin(比宽限更紧·PM裁决):列级锁定,非admin改动被静默还原为旧值
-- (与该函数已保护的 current_status 等字段同一模式;RLS 行级仍允许本班zhumai/aixin改auto愿的其它列,
--  如 due_date 宽限,只是 min_session_minutes 这一列单独锁给 admin)。
-- ⚠️ 顺带补齐一个既有不一致:profiles_protect_status 早有 app.allow_protected_write 旁路(给内部
--   SECURITY DEFINER 流程/测试夹具用),但 vows_protect_status 从未有——本轮统一补上,让"合法内部写"
--   与"改门槛"共用同一套逃生舱,而不是各写各的。
CREATE OR REPLACE FUNCTION public.vows_protect_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_system_admin()
     AND current_setting('app.allow_protected_write', true) IS DISTINCT FROM 'on' THEN
    NEW.current_status       := OLD.current_status;
    NEW.status_calculated_at := OLD.status_calculated_at;
    NEW.status_details       := OLD.status_details;
    NEW.min_session_minutes  := OLD.min_session_minutes;
  END IF;
  IF OLD.source = 'auto' AND auth.uid() = OLD.user_id THEN
    NEW.current_end_date  := OLD.current_end_date;
    NEW.original_end_date := OLD.original_end_date;
  END IF;
  RETURN NEW;
END $$;

-- 20260716000000_provision_current_date_fallback · 发愿函数的CURRENT_DATE兜底改按时区算(三易审计跟进)
--
-- 背景:CLAUDE.md §1 铁律"禁用 CURRENT_DATE 当'今天'"(服务器UTC不代表用户/班级当地"今天")。
-- provision_member_vows/provision_selfstudy_vows 各有一行 COALESCE(v_x, CURRENT_DATE) 兜底——
-- 只在数据异常缺失(joined_at被显式插成NULL / 自学登记行不存在)时触发,正常业务流程几乎走不到
-- (已用现有调用链核实:两个函数唯一的合法入口分别是 provision_cohort_vows 的
-- FOR...SELECT...LOOP、和前端 self-study.ts 先插行再调用,均保证被查的行存在)。触发条件罕见
-- 不代表可以不管——铁律没有"低概率例外",改起来成本也低。
--
-- 两个函数分别用哪种既有模式,取决于"函数自己够不够信息算出正确时区"(核实过 cohorts 有
-- timezone 列、programs/user_self_study_programs 都没有,自学也没有任何"用户当时设备时区"的
-- 持久化字段——§1"个人打卡跟手机本地"这层信息物理上只有前端知道):
--   · provision_member_vows:函数体内已经 SELECT * INTO v_cohort,v_cohort.timezone 现成可用,
--     用"函数体内部转时区"既有模式(同 cohort_today_active.sql/neijiaxing_expiry_lock.sql),
--     不改签名、不改前端。
--   · provision_selfstudy_vows:DB 侧查不出"该学员手机本地今天",只能让前端显式传
--     (同 get_current_week_number/get_vow_status 的既有模式)——前端 self-study.ts 报名时本就已经
--     算过 localToday() 写 start_date,这里只是把同一个值也传给 RPC,零额外计算成本。
--
-- ⚠️ provision_selfstudy_vows 不能裸 CREATE OR REPLACE 加第3个参数:Postgres 的
-- CREATE OR REPLACE 只有"参数类型列表完全相同"才会替换旧定义,多一个参数(即便带 DEFAULT)=
-- 新建一个重载,旧的2参签名原样留着——此后任何2参调用会在新旧两个重载间产生歧义,直接报
-- "function ... is not unique"(42725),不会按默认值兜底到旧行为(本机 Postgres 16 实测证实,
-- 三易审计的第一版方案就是栽在这里,幸好在落地前发现)。必须显式 DROP 旧签名再 CREATE 新签名。
-- 新函数创建后 Postgres 默认会重新对 PUBLIC 开 EXECUTE(本项目在 20260708000500 已经踩过、补
-- 收紧过这个坑),这里也要重新 REVOKE/GRANT 一遍,否则 anon 又能拿到执行权。

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
  v_join := COALESCE(v_join, (now() AT TIME ZONE COALESCE(v_cohort.timezone, 'UTC'))::date);

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

DROP FUNCTION IF EXISTS provision_selfstudy_vows(uuid, uuid);
CREATE FUNCTION provision_selfstudy_vows(p_user_id uuid, p_program_id uuid, p_today date DEFAULT CURRENT_DATE)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_start date;
  v_lock_years int;
  v_created integer := 0;
BEGIN
  IF NOT (p_user_id = auth.uid() OR is_system_admin()) THEN
    RAISE EXCEPTION '无权限:只能为本人发放自学愿';
  END IF;
  SELECT start_date INTO v_start FROM user_self_study_programs WHERE user_id = p_user_id AND program_id = p_program_id;
  v_start := COALESCE(v_start, p_today);
  SELECT neijiaxing_lock_years INTO v_lock_years FROM programs WHERE id = p_program_id;

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
      WHEN t.is_time_limited THEN (v_start + COALESCE(t.starts_offset_days, 0)) + COALESCE(v_lock_years, 4) * 365
      WHEN t.duration_days IS NOT NULL THEN v_start + t.duration_days
      ELSE v_start + COALESCE(v_lock_years, 4) * 365
    END,
    CASE
      WHEN t.target_period = 'lifetime' THEN NULL
      WHEN t.is_time_limited THEN (v_start + COALESCE(t.starts_offset_days, 0)) + COALESCE(v_lock_years, 4) * 365
      WHEN t.duration_days IS NOT NULL THEN v_start + t.duration_days
      ELSE v_start + COALESCE(v_lock_years, 4) * 365
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

REVOKE ALL ON FUNCTION provision_selfstudy_vows(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION provision_selfstudy_vows(uuid, uuid, date) TO authenticated;

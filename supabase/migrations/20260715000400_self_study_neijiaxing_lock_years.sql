-- 20260715000400_self_study_neijiaxing_lock_years · 自学内加行年限改可配置(三易审计跟进)
--
-- 背景:cohorts.neijiaxing_lock_years(20260618000010,基数年限,NOT NULL DEFAULT 4)从建表起
-- 就是按班可调的字段,班级路径 provision_member_vows 一直读它算内加行截止日。自学路径
-- provision_selfstudy_vows 是后加的,加的时候没接上这个口子,4年直接写死在函数体里——不是
-- "自学故意跟班级不一样",是漏接了本该有的灵活性(三易审计 2026-07-15 发现,PM 裁定补上)。
--
-- 参照 cohorts 的既有先例:programs 加同名同义字段,默认还是4年——现在任何自学学员算出来的
-- 截止日不变,只是教务以后想针对某个专业单独调年限时,有地方能调,不用再改代码/发版。
ALTER TABLE programs ADD COLUMN IF NOT EXISTS neijiaxing_lock_years int NOT NULL DEFAULT 4 CHECK (neijiaxing_lock_years > 0);

COMMENT ON COLUMN programs.neijiaxing_lock_years IS
  '自学学员内加行到期年限(天数按 ×365 折算,同 cohorts.neijiaxing_lock_years 的既有先例);
  默认4年。provision_selfstudy_vows() 读这个字段算限时功课截止日,不再硬编码4。';

CREATE OR REPLACE FUNCTION provision_selfstudy_vows(p_user_id uuid, p_program_id uuid)
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
  v_start := COALESCE(v_start, CURRENT_DATE);
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

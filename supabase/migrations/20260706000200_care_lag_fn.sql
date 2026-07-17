-- ============================================================
-- 关怀 5 维聚合（判例先行阶段2·模块2·子波 SM-5/6/7/8）· DB 函数单一真源
-- 依据 tests/casebook/state-machine.md SM-5~8 + DEF-4（状态机→聚合进5维→关怀名单）+ 方向甲（2026-07-06 PM）。
--   SM-5 日常功课维(task) / SM-6 观修维(meditation)：把 get_vow_status 的 per-vow 状态按 practices.category
--     数据驱动分流（观修维=analytical/meditation 座上观修；日常功课维=其余念诵/顶礼/读经），worst-of 聚合。
--   SM-7 出勤维(attendance)：共修出勤率(仅 tracks_attendance 场次) → 3 档（占位阈值 85/70·延后-5 待教务）。
--   SM-8 关怀名单：任一可算维(非 na)=high → flagged。听课/答题维本轮 na（无可靠数据流·SM-7 边界）。
-- ⚠️ SD-1：读时算·单一真源；Edge cron 落地后调用本函数落 cohort_lag_snapshot 快照。
-- ⚠️ 出勤维「只算正式期」(决策180/181)：SD-6 待细化已于 20260714000000 补上——转正时间从
--     promote_member_role 写的 audit_logs 反推（查不到退回 joined_at），见该迁移头注。
-- ============================================================

-- per-vow 状态 → 滞后档（SM-5/6 映射）
CREATE OR REPLACE FUNCTION vow_status_to_lag(p_status text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
           WHEN 'at_risk' THEN 'high'
           WHEN 'falling_behind' THEN 'medium'
           WHEN 'on_track' THEN 'low'
           ELSE 'na' END;
$$;

-- 修持维滞后：worst-of 该用户在该班的 active 愿（按 category 分观修维/日常功课维）
--   p_meditation=true → 观修维(category analytical/meditation)；false → 日常功课维(其余含 NULL)
-- ⚠️ XJ-10（prd 行972 / 大纲行500-501）：只算 source='auto'（系统安排的必修）；source='custom'
--    （师兄自选经/抄经/拜经/自发愿）荒废视为自愿项、非掉队，不进关怀名单——故此处按 source 过滤。
CREATE OR REPLACE FUNCTION practice_dim_lag(p_user uuid, p_cohort uuid, p_today date, p_meditation boolean)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  r        record;
  lag      text;
  has_hi   boolean := false;
  has_med  boolean := false;
  has_any  boolean := false;
BEGIN
  FOR r IN
    SELECT v.id
    FROM user_practice_vows v JOIN practices p ON p.id = v.practice_id
    WHERE v.user_id = p_user AND v.cohort_id = p_cohort AND v.status = 'active'
      AND v.source = 'auto'                              -- XJ-10：自选功课不计入掉队/关怀
      AND ( (p_meditation      AND p.category IN ('analytical','meditation'))
         OR (NOT p_meditation  AND (p.category IS NULL OR p.category NOT IN ('analytical','meditation'))) )
  LOOP
    lag := vow_status_to_lag(get_vow_status(r.id, p_today));
    IF lag = 'na' THEN CONTINUE; END IF;            -- 未起修等 → 不计
    has_any := true;
    IF lag = 'high' THEN has_hi := true; ELSIF lag = 'medium' THEN has_med := true; END IF;
  END LOOP;
  IF NOT has_any THEN RETURN 'na'; END IF;
  RETURN CASE WHEN has_hi THEN 'high' WHEN has_med THEN 'medium' ELSE 'low' END;
END $$;

-- 出勤维：出勤率(仅记考勤场次) → 3 档（占位阈值·延后-5 待教务）
CREATE OR REPLACE FUNCTION attendance_dim_lag(p_user uuid, p_cohort uuid)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE attended int; total int; rate numeric;
BEGIN
  SELECT count(*) FILTER (WHERE sr.study_type = 'group_attend'),
         count(*) FILTER (WHERE sr.study_type IN ('group_attend','group_absent'))
    INTO attended, total
  FROM study_records sr LEFT JOIN group_sessions gs ON gs.id = sr.group_session_id
  WHERE sr.user_id = p_user AND sr.cohort_id = p_cohort AND COALESCE(gs.tracks_attendance, true);
  IF total = 0 THEN RETURN 'na'; END IF;
  rate := attended::numeric / total;
  RETURN CASE WHEN rate >= 0.85 THEN 'low' WHEN rate >= 0.70 THEN 'medium' ELSE 'high' END;  -- 占位 85/70
END $$;

-- 关怀 5 维 + flagged 聚合（SM-8）
CREATE OR REPLACE FUNCTION get_care_dims(p_user uuid, p_cohort uuid, p_today date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE att text; task text; med text;
BEGIN
  att  := attendance_dim_lag(p_user, p_cohort);
  task := practice_dim_lag(p_user, p_cohort, p_today, false);
  med  := practice_dim_lag(p_user, p_cohort, p_today, true);
  RETURN jsonb_build_object(
    'attendance', att,
    'task',       task,
    'content',    'na',     -- 听课维本轮不做（无可靠数据流·SM-7 边界）
    'quiz',       'na',     -- 答题维本轮不做
    'meditation', med,
    'flagged',    (att = 'high' OR task = 'high' OR med = 'high')   -- SM-8：任一可算维 high
  );
END $$;

COMMENT ON FUNCTION get_care_dims(uuid, uuid, date) IS
  '关怀5维滞后+flagged 聚合（SM-5~8·DEF-4·方向甲）。task/meditation 由 get_vow_status 按 category 分流 worst-of；attendance=出勤率占位档；content/quiz 本轮 na。Edge cron 落地后调用本函数落快照。';

GRANT EXECUTE ON FUNCTION vow_status_to_lag(text)             TO authenticated;
GRANT EXECUTE ON FUNCTION practice_dim_lag(uuid,uuid,date,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION attendance_dim_lag(uuid,uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION get_care_dims(uuid,uuid,date)       TO authenticated;

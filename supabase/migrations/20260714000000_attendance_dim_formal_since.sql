-- B11业务语义审计(2026-07-14)补SM-7缺口:出勤维"只算正式期"(决策180/181)此前只做了
-- "只算记考勤场次"这一半,旁听期(转正前)的出勤记录一直混在整个出勤率里算,可能冤枉刚转正
-- 但旁听期出勤不勤快的学员。PM选项B(不新建formal_since列):转正时间从promote_member_role
-- 自己写的audit_logs审计记录反推,查不到(如最早一批直接建成正式、没走转正流程)就退回
-- 入班日期(joined_at)——单一真源仍是audit_logs,不额外建一份容易跟着漂移的记录。
CREATE OR REPLACE FUNCTION attendance_dim_lag(p_user uuid, p_cohort uuid)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE attended int; total int; rate numeric; since_date date;
BEGIN
  SELECT (al.created_at AT TIME ZONE COALESCE(co.timezone, 'UTC'))::date
    INTO since_date
  FROM audit_logs al JOIN cohorts co ON co.id = p_cohort
  WHERE al.action = 'promote_member_role' AND al.target_type = 'class_members' AND al.target_id = p_cohort
    AND al.metadata->>'subject_user_id' = p_user::text
  ORDER BY al.created_at DESC LIMIT 1;

  IF since_date IS NULL THEN
    SELECT (cm.joined_at AT TIME ZONE COALESCE(co.timezone, 'UTC'))::date
      INTO since_date
    FROM class_members cm JOIN cohorts co ON co.id = cm.cohort_id
    WHERE cm.cohort_id = p_cohort AND cm.user_id = p_user;
  END IF;

  SELECT count(*) FILTER (WHERE sr.study_type = 'group_attend'),
         count(*) FILTER (WHERE sr.study_type IN ('group_attend','group_absent'))
    INTO attended, total
  FROM study_records sr LEFT JOIN group_sessions gs ON gs.id = sr.group_session_id
  WHERE sr.user_id = p_user AND sr.cohort_id = p_cohort AND COALESCE(gs.tracks_attendance, true)
    AND (since_date IS NULL OR sr.study_date >= since_date);
  IF total = 0 THEN RETURN 'na'; END IF;
  rate := attended::numeric / total;
  RETURN CASE WHEN rate >= 0.85 THEN 'low' WHEN rate >= 0.70 THEN 'medium' ELSE 'high' END;  -- 占位 85/70,延后-5待教务
END $$;

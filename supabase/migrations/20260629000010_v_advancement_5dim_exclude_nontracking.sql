-- ============================================================
-- 20260629000010 · v_advancement_5dim.attendance_count 排除"不计出勤"场次
-- ------------------------------------------------------------
-- group_sessions.tracks_attendance=false 的场次(临时集会)不计入出勤率(决策 2026-06-21)。
-- 视图的 attendance_count 原本统计全部 group_attend;此处加 join 排除不计场,与应用层口径一致。
-- (App 端关怀/升学/总览的出勤率已改应用层计算并排除;本视图修正供其它消费方一致。)
-- ============================================================
CREATE OR REPLACE VIEW v_advancement_5dim WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id AND vt.obtained) AS transmissions_obtained,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id)                  AS transmissions_required,
  (SELECT count(*) FROM study_records sr
     LEFT JOIN group_sessions gs ON gs.id = sr.group_session_id
     WHERE sr.user_id = p.id AND sr.study_type = 'group_attend'
       AND COALESCE(gs.tracks_attendance, true)) AS attendance_count,
  (SELECT COALESCE(sum(v.current_count), 0) FROM user_practice_vows v WHERE v.user_id = p.id)     AS practice_total,
  (SELECT count(*) FROM exam_grades e WHERE e.user_id = p.id AND e.is_pass)                       AS exams_passed
FROM profiles p;

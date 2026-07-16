-- ============================================================
-- 入行/每周型「本周座数」聚合层（判例先行阶段2·Wave 3）
-- 依据 tests/casebook/counting.md：RX-2/RX-3/RX-4 + PD-17（周界）。
--   每周型愿(target_period='weekly')按自然周独立计 session_count 之和。
--   周界 = ISO 周（周一起算），date_trunc('week',log_date) 返回周一（PD-17：周一 00:00 起算新周）。
--   本周独立、不跨周累计（RX-3）；超额不结转（RX-4，天然：按 week_start 分组，各周独立）。
-- ⚠️ 时区（PD-17/RX-5）：应按【班级时区】自然周判"本周"。本视图按 log_date 的 ISO 周分组给出各周计数，
--     "哪个 week_start 是当前本周"由 app 用班级时区今天选取；跨时区归周细节见 PD-13。
-- ⚠️ 达标(met=week_sessions>=weekly_target)仅为计数派生；"是否系统判掉队/影响升学"属 PD-16 待裁决、状态机延后-27。
-- 入行座次语义(RX-1「1打卡=1座·时长不限」)与加行(≥30分=1座)的差异已由 PD-30 解决(已施工)：
--     practices.session_mode 数据驱动计座——per_log=1打卡1座(入行)、by_duration=≥门槛计座(加行)，见 20260704000300。
--     本视图对 session_count 的来源无假设，只做求和；测试夹具以显式 session_count=1 表达入行"1打卡=1座"。
-- ============================================================
CREATE OR REPLACE VIEW v_weekly_session_count
WITH (security_invoker = true) AS
SELECT
  v.id                                            AS vow_id,
  v.user_id                                       AS user_id,
  v.cohort_id                                     AS cohort_id,
  date_trunc('week', l.log_date)::date            AS week_start,
  v.weekly_target                                 AS weekly_target,
  SUM(COALESCE(l.session_count, 0))               AS week_sessions,
  (SUM(COALESCE(l.session_count, 0)) >= v.weekly_target) AS met
FROM user_practice_vows v
JOIN practice_logs l ON l.vow_id = v.id
WHERE v.target_period = 'weekly' AND v.weekly_target IS NOT NULL
GROUP BY v.id, v.user_id, v.cohort_id, date_trunc('week', l.log_date), v.weekly_target;

COMMENT ON VIEW v_weekly_session_count IS
  '每周型愿的本周座数聚合（RX-2/3/4）。周界=ISO周(周一起算·PD-17)。各周独立、不结转。security_invoker：师兄只见自己(#193)。';

GRANT SELECT ON v_weekly_session_count TO authenticated;

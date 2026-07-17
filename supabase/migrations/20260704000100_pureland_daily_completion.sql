-- ============================================================
-- 净土/每日型「当日完成制」聚合层（判例先行阶段2·Wave 2）
-- 依据 tests/casebook/counting.md：JT-3/JT-5/JT-6/JT-8/JT-10。
--   每日型愿(target_period='daily')按"每天有没有完成当天功课量"判定。
--   当日累计 = 该愿该 log_date 的 count 之和；≥ daily_target 即"完成该天"（含等号）。
--   同日多笔累加（SUM）；没记录的日子不在视图中出现（= 未完成，JT-8 默认0）。
-- ⚠️ 时区：log_date 由 app 按【手机本地当日】写入（JT-7/PD-24），本视图只按 log_date 聚合，
--     不在 DB 做时区转换——"今天算哪天"的判定在应用写入端。
-- ⚠️ 本视图仅"计数/完成"；"坚持天数"算法(JT-4)属 PD-8 待裁决、状态机延后-27，不在此。
--    净土「三选一锁定」(JT-1/JT-2·PD-6 落点未定)属配置约束，非本聚合层。
-- 通用性：对所有每日型愿生效（净土念佛 + 学经心经/普贤 Wave 4 复用）。
-- ============================================================
CREATE OR REPLACE VIEW v_daily_practice_completion
WITH (security_invoker = true) AS
SELECT
  v.id                                          AS vow_id,
  v.user_id                                     AS user_id,
  v.cohort_id                                   AS cohort_id,
  l.log_date                                    AS log_date,
  v.daily_target                                AS daily_target,
  SUM(COALESCE(l.count, 0))                     AS day_total,
  (SUM(COALESCE(l.count, 0)) >= v.daily_target) AS completed
FROM user_practice_vows v
JOIN practice_logs l ON l.vow_id = v.id
WHERE v.target_period = 'daily' AND v.daily_target IS NOT NULL
GROUP BY v.id, v.user_id, v.cohort_id, l.log_date, v.daily_target;

COMMENT ON VIEW v_daily_practice_completion IS
  '每日型愿的当日完成聚合（JT-5/6）。security_invoker：随查询者 RLS，师兄只见自己（#193）。log_date 由 app 按手机本地当日写入，本视图不做时区转换。';

GRANT SELECT ON v_daily_practice_completion TO authenticated;

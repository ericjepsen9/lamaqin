-- ============================================================
-- practice_logs 幂等提交(弱网数据准确性·2026-07-12)
--   问题:弱网下"请求已成功写入但确认响应丢失"是真实场景——客户端误判失败、用户手动/自动
--   重试,会再插一行,而 practice_logs_update_vow_trigger 会把这行的 count 再次累加到愿的
--   官方累计数(current_count)上,直接影响升学"修量"统计的准确性。
--   现方案:客户端生成一次性 client_token 随请求带上;同一 token 只允许成功落库一次
--   (唯一索引兜底),App 侧对"重复键"错误特殊处理为"已成功"而非报错,不影响用户体验、
--   也不会重复计数。
-- ============================================================

ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS client_token text;
-- 只对"带了 token 的"写入做唯一性约束;旧数据/未来其它写入路径不传 token 时不受影响
-- (同一 token 只在同一次真实提交内使用,不同用户/不同笔提交天然不会撞同一个 token)。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_practice_logs_client_token
  ON practice_logs(client_token) WHERE client_token IS NOT NULL;

COMMENT ON COLUMN practice_logs.client_token IS
  '客户端一次性提交凭证(弱网幂等用):同一凭证唯一索引拒绝重复插入,App 侧对该冲突当"已成功"处理,防止网络重试导致的重复计数。';

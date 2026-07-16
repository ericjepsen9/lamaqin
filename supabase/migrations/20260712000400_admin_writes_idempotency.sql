-- ============================================================
-- 20260712000400_admin_writes_idempotency · 后台管理写操作弱网幂等
-- 背景(PM 2026-07-12"新做的内容,后台管理也做了吗"追问引出):practice_logs 那次
-- 弱网改造(20260712000000)只覆盖了学员打卡,今天新增/大量复用的后台管理写操作
-- (报数升学判定/考试成绩录入/学期末留级转班/旁听审阅/考试豁免)完全没有同款保护——
-- admin 网络卡顿看不到确认反馈、手动重试提交,可能被记录两遍(如两条 advancement_records,
-- 或留级次数被多加一次)。同 practice_logs 的方案:client_token 一次性提交凭证 + 唯一索引 +
-- App 侧把"重复键"当"已成功"处理,不当报错。
-- ============================================================

ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_advancement_records_client_token
  ON advancement_records(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_exam_grades_client_token
  ON exam_grades(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_proxy_action_records_client_token
  ON proxy_action_records(client_token) WHERE client_token IS NOT NULL;

COMMENT ON COLUMN advancement_records.client_token IS
  '客户端一次性提交凭证(弱网幂等用,同 practice_logs.client_token 方案):同一凭证唯一索引拒绝重复插入,App 侧对该冲突当"已成功"处理。';
COMMENT ON COLUMN exam_grades.client_token IS
  '客户端一次性提交凭证(弱网幂等用,同 practice_logs.client_token 方案):同一凭证唯一索引拒绝重复插入,App 侧对该冲突当"已成功"处理。';
COMMENT ON COLUMN proxy_action_records.client_token IS
  '客户端一次性提交凭证(弱网幂等用,同 practice_logs.client_token 方案):同一凭证唯一索引拒绝重复插入,App 侧对该冲突当"已成功"处理。';

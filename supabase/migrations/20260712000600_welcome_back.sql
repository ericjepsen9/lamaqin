-- ============================================================
-- 20260712000600_welcome_back · 老学员植入"欢迎回来"页(决策076沿用 prd §5.1.2)
--
-- 背景:决策076(2026-06-13)确认老学员植入三件套(CSV批量导入/首登OTP/欢迎回来页)
-- 均"沿用"原设计。首登OTP已是全站通用机制、批量导入待PM给真实数据后另做一次性
-- 处理(不建通用UI);本迁移做"欢迎回来页"这一件——每位 data_source='imported'
-- 的老学员首次登录时触发,是常驻功能(非一次性),故值得正式建。
--
-- 原方案想用 last_sign_in_at IS NULL 判断"首次登录",但触发欢迎页的这次登录
-- 本身就会更新 auth.users.last_sign_in_at——时序上不可靠(2026-07-12 调研发现)。
-- 改用独立标记 welcome_seen_at:NULL=未看过、非NULL=已看过,查看时机由 App 显式写入,
-- 不依赖任何隐式更新的时间戳。
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_seen_at timestamptz;

COMMENT ON COLUMN profiles.welcome_seen_at IS
  '老学员植入"欢迎回来"页(决策076)是否已看过;NULL=未看过。仅 data_source=''imported''
  且此列为 NULL 的用户,登录后会被入口闸门(app/index.tsx)导向欢迎页;看过/跳过后由
  App 写入当前时间。独立标记而非借用 last_sign_in_at,避免该字段被本次登录自身更新
  产生的时序竞态。';

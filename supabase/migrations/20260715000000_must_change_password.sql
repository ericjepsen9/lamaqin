-- 20260715000000_must_change_password · 强制改密码标记(2026-07-15 老学员登录问题排查衍生)
--
-- 背景:老学员批量导入账号(data_source='imported')在数据库层面缺失若干 auth.users 内部
-- 字段,导致密码/验证码登录全部失败(诊断详见对话记录,修复 SQL 另附,需 PM 或有 psql 权限
-- 的一方在 sss-dev 执行,本迁移不含该修复,只加下面这个通用标记列本身)。
-- PM 决定:借这次修复顺路给这批账号统一设一个默认密码,首次登录后强制(不可跳过)改成
-- 自己的密码。
--
-- 不把这个标记写成 data_source='imported' 专属判断(那是"谁需要强制改密码"的业务决定,
-- 该用哪批数据一次性 UPDATE 就够,不该硬编码进闸门逻辑),而是加一个通用布尔列——以后任何
-- 场景需要"强制此账号下次登录先改密码"(如管理员手动重置某人密码),都可复用同一套闸门+
-- 页面,不必再造一遍。
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS
  'true=下次登录成功后,入口闸门(app/index.tsx)强制导向 /set-password?forced=1 且不可跳过,
  提交新密码成功后由 App 写回 false。用于老学员导入批量设默认密码的场景(2026-07-15),
  也可复用于其它"必须先改密码才能继续"的场景。默认 false,不影响正常注册用户。';

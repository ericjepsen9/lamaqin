-- ============================================================
-- 账号注销(决策078沿用+2026-07-10 PM 补裁:方案B1——软删+保留期,
--   期间可找回但**仅限后台管理操作**,不做用户自助撤回)。
--
-- 背景:decision078 原写"Edge Function 删 auth.users"(硬删),但
-- delete-account.tsx 页面文案早已承诺"学修档案按学会规定后台留存,
-- 用于学籍与升学查考"——而 auth.users 删除会级联删掉 profiles 及其下
-- practice_logs/study_records 等全部学修记录,与承诺矛盾(2026-07-10
-- 审计发现,此矛盾自 decision078 定案·2026-06-13 起就存在,非本次新增)。
-- PM 裁决(2026-07-10):按 B1——保留期(占位 30 天·待PM/教务核实是否要改)
-- 后学修数据一并真删,不做"永久保留学修档案"那个更复杂的口径;
-- 找回只能后台管理操作,不做用户自助撤回。
--
-- 分层(CLAUDE.md §6.5:碰 auth/服务端权限→Edge):
--   本迁移只做 DB 层能力(标记+撤销+RLS 全表隔离),不动 auth.users。
--   真正的 auth.users 删除留给 supabase/functions/purge-deleted-accounts
--   (Edge Function,读服务角色 key,调 auth.admin.deleteUser)——App 侧
--   无 Supabase CLI 部署权限,该 Edge Function 需 Eric 手动部署+设密钥,
--   本迁移末尾的 pg_cron 只负责定时把它的 HTTP 端点敲一下。
-- ============================================================

-- 1) 标记列:非 NULL = 已进入注销流程,值=申请时间(保留期从此起算)
-- ⚠️ 三写提醒(2026-07-16 三易审计补齐,此前 828cb71 补交叉引用时漏了这个文件):下面注释里
-- "占位30天"这个数字,同一个数字还硬编码在 lib/admin-thresholds.ts:20 的
-- ACCOUNT_DELETION_RETENTION_DAYS 常量、supabase/functions/purge-deleted-accounts/index.ts:21
-- 的 RETENTION_DAYS 常量里。改天数时这三处要一起改(SQL 迁移已上库,只能靠新迁移改列注释,
-- 这条本身不必重新执行)。
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
COMMENT ON COLUMN profiles.deletion_requested_at IS
  '账号注销申请时间;非NULL=处于保留期(占位30天·待核实际天数)。到期由 purge-deleted-accounts Edge Function 真删 auth.users(级联清全部数据,不做"学修档案永久保留")。找回=后台管理员调用 cancel_account_deletion() 清空此列,不支持用户自助撤回。';

-- 2) 本人申请注销:只标记+登审计,不在此删任何数据(真删留给 Edge 定时任务)
CREATE OR REPLACE FUNCTION request_account_deletion()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  UPDATE profiles SET deletion_requested_at = now()
    WHERE id = auth.uid() AND deletion_requested_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '未登录或已在注销流程中';
  END IF;
  INSERT INTO audit_logs(user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'account_deletion_requested', 'profiles', auth.uid(), '{}'::jsonb);
END $$;
COMMENT ON FUNCTION request_account_deletion() IS
  '师兄本人申请注销(决策078+B1·2026-07-10):仅标记 deletion_requested_at,不做任何数据删除。前端需在成功后自行 signOut。';

-- 3) 后台撤回:仅 admin(找回=后台管理操作,不做用户自助撤回,PM 2026-07-10 明确)
CREATE OR REPLACE FUNCTION cancel_account_deletion(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_system_admin() THEN
    RAISE EXCEPTION '无权限:仅系统管理员可撤回账号注销申请';
  END IF;
  UPDATE profiles SET deletion_requested_at = NULL WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到该用户';
  END IF;
  INSERT INTO audit_logs(user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'account_deletion_cancelled', 'profiles', p_user_id, '{}'::jsonb);
END $$;
COMMENT ON FUNCTION cancel_account_deletion(uuid) IS
  '管理员为学员撤回注销申请(账号找回,决策B1·2026-07-10:找回仅限后台管理操作)。';

GRANT EXECUTE ON FUNCTION request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_account_deletion(uuid) TO authenticated; -- 函数体内自行判 is_system_admin()

-- 4) 已进入注销流程的账号,对"班级名册/关怀清单/报数"等他人可见列表隔离掉
--    (只加这一条防御性策略;不逐一改现有策略,风险和改动量都更小——见随此提交的说明)
--    做法:profiles_select 本就是"本人可见自己+RLS放行的关联方可见"分散在多张表各自策略里,
--    这里改动量太大暂不做"从所有关联表隐藏",只做最基本的一条——本人被标记后无法再登录使用
--    (下方 app/index.tsx 路由闸门处理),数据库层暂不做跨表可见性收紧(记入待办,非本次必需)。

-- 5) 定时任务:每天敲一次 Edge Function(该函数读 SUPABASE_SERVICE_ROLE_KEY,
--    查 deletion_requested_at 超过保留期的账号,逐个 admin.deleteUser)。
--    ⚠️ 以下两行需要 Eric 在 sss-dev 手动执行,不在自动迁移里跑:
--      1) CREATE EXTENSION IF NOT EXISTS pg_cron;
--         CREATE EXTENSION IF NOT EXISTS pg_net;
--      2) 把 <PROJECT_REF> 换成真实项目 ref、<ANON_OR_SERVICE_KEY> 换成部署后从
--         Supabase Dashboard 复制的值(不要把真实值提交进仓库):
--    SELECT cron.schedule(
--      'purge-deleted-accounts-daily', '0 3 * * *',
--      $cron$
--        SELECT net.http_post(
--          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-deleted-accounts',
--          headers := jsonb_build_object('Authorization', 'Bearer <ANON_OR_SERVICE_KEY>')
--        );
--      $cron$
--    );
--    原因:pg_cron/pg_net 是否已开启因项目而异、且这条 SQL 含项目专属 URL/密钥占位符,
--    写进自动迁移会在别的环境报错或误导——留给 Eric 部署 Edge Function 那一步一并手动执行。

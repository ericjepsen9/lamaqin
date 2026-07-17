-- 20260715000100_admin_create_user · 后台管理直接创建学员(PM 2026-07-15 决定:不需要师兄手机端自助注册)
--
-- 背景:此前唯一"绕开自助注册"建号的路径是老学员批量导入,且是仓库外一次性脚本(见
-- 20260715000000 的诊断记录)。PM 现在要的是一个随时可用的后台功能,而不是再来一次
-- 一次性脚本。schema 早就预留了 data_source='admin_created' 这个值(本迁移之前就在
-- CHECK 约束里,只是从未被真正用过的功能——本迁移是第一次把它接上实际业务)。
--
-- 为什么要 Edge Function 配这个 RPC,不能在 App 里直接 supabase.from('profiles').update(...):
-- ①真正建 auth.users 那一步必须用 GoTrue Admin API(auth.admin.createUser),这需要
-- service_role key——client 端 App 代码永远不能拿到这个 key(否则任何人都能自建 admin 权限,
-- 铁律),只能在 Edge Function(服务端、密钥不下发浏览器/App)里调用。
-- ②建号后 handle_new_auth_user 触发器会自动补一条 status='pending' 的裸 profiles 行——
-- 需要再把它改成 status='active' + data_source='admin_created',但 profiles_protect_status
-- 触发器锁了这几列(非 admin session 写入会被静默还原,见 20260618000010):Edge Function
-- 用 service_role 调用时 auth.uid() 是空、is_system_admin() 判不出"是admin"，一样会被那道
-- 触发器挡下——所以需要这条 SECURITY DEFINER 函数,内部显式打开 app.allow_protected_write
-- 旁路(同 promote_member_role 的既有手法),再改这几列。
--
-- 谁能调:仅 service_role(下面 REVOKE/GRANT),常规登录用户(含 admin 本人的会话)拿不到
-- 执行权——那道"是不是真的 admin"的判断,发生在 Edge Function 里(校验调用者 JWT 后查
-- system_admins),不在这条函数里重复判断(判断不出来,身份信息在这一步已经不在了)。
CREATE OR REPLACE FUNCTION public.admin_finalize_created_profile(
  p_user_id uuid,
  p_full_name text,
  p_dharma_name text,
  p_phone text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.allow_protected_write', 'on', true);
  UPDATE profiles SET
    full_name = p_full_name,
    dharma_name = p_dharma_name,
    phone = p_phone,
    status = 'active',
    data_source = 'admin_created',
    must_change_password = true
  WHERE id = p_user_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_finalize_created_profile(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_created_profile(uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.admin_finalize_created_profile IS
  '只给 supabase/functions/admin-create-student 这个 Edge Function 调(service_role 专用,
  已 REVOKE 掉 authenticated/anon 执行权)。建 auth.users 之后,把触发器自动生成的裸 profiles
  行补成正式的"后台创建"账号:status 直接 active(admin 建号本身即等同已审批,决策058同类
  先例)、data_source 标 admin_created、must_change_password 强制下次登录先改密码(同批
  20260715000000 老学员默认密码用的同一套闸门)。';

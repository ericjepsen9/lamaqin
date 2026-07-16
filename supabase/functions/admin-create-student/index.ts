// 后台管理直接创建学员账号(PM 2026-07-15 决定:不需要师兄手机端自助注册)
//
// 谁调它:App 里 admin 登录后点「创建学员」,supabase.functions.invoke() 默认会把当前
//   admin 自己的登录态 access token 带在 Authorization 头里——这里校验的就是这个真实
//   会话,不是像 purge-deleted-accounts 那样校验固定的 service_role key(那个是给
//   pg_cron 这种没有"人"在操作的场景用的,这里是有真人在点按钮,要认清楚是不是真的
//   system_admin,不能只信 App 端传来的"我是admin")。
//
// 为什么是 Edge Function 不是纯 DB 函数/前端直连(CLAUDE.md §8:碰 auth/服务端权限→Edge):
//   真正建 auth.users 用户必须走 GoTrue Admin API(auth.admin.createUser),这需要
//   service_role key——前端/App 代码永远不能持有这个 key(持有等于任何人都能自建
//   admin 权限)。这也是为什么这次不会重蹈"老学员批量导入"直接裸 SQL 插 auth.users
//   踩的坑(20260715000000 的诊断):Admin API 走 GoTrue 自己的建号路径,该补的内部字段
//   它自己会补全,不会再出现"Database error finding user"那类问题。
//
// 部署(Eric/有 Supabase CLI 权限的一方手动,App 侧本身无 CLI 部署权限):
//   supabase functions deploy admin-create-student
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<sss-dev 的 service_role key>
//   (SUPABASE_URL 由平台自动注入,不需要手设)
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 校验调用者真的是登录中的 system_admin(不是固定 service_role key 那种"信任调用方式"
  // 的校验,是真的按这个人的会话 token 反查身份)。
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerToken) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }
  const { data: callerData, error: callerErr } = await admin.auth.getUser(callerToken);
  if (callerErr || !callerData?.user) {
    return new Response(JSON.stringify({ error: '登录态无效,请重新登录后重试' }), { status: 401 });
  }
  const { data: adminRow } = await admin
    .from('system_admins')
    .select('user_id')
    .eq('user_id', callerData.user.id)
    .maybeSingle();
  if (!adminRow) {
    return new Response(JSON.stringify({ error: '仅系统管理员可创建学员账号' }), { status: 403 });
  }

  let body: { email?: string; password?: string; fullName?: string; dharmaName?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400 });
  }
  const email = body.email?.trim();
  const password = body.password ?? '';
  const fullName = body.fullName?.trim();
  if (!email || !/.+@.+\..+/.test(email)) {
    return new Response(JSON.stringify({ error: '邮箱格式不对' }), { status: 400 });
  }
  if (password.length < 8) {
    return new Response(JSON.stringify({ error: '初始密码至少 8 位' }), { status: 400 });
  }
  if (!fullName) {
    return new Response(JSON.stringify({ error: '姓名不能为空' }), { status: 400 });
  }

  // email_confirm:true——admin 手动创建本身即等同已核实,不走自助注册的邮箱确认那一步
  // (同老学员批量导入的既有先例,PRD/schema 文档早就这么设计,只是从未真正接过 UI)。
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? '建号失败';
    const taken = /already.*registered|already.*exists/i.test(msg);
    return new Response(JSON.stringify({ error: taken ? '该邮箱已注册过账号' : msg }), { status: 400 });
  }

  // 建号会触发 handle_new_auth_user,自动生成一条 status='pending' 的裸 profiles 行;
  // 这里补成正式的"后台创建"账号(见迁移 20260715000100 里该函数的完整注释)。
  const { error: finalizeErr } = await admin.rpc('admin_finalize_created_profile', {
    p_user_id: created.user.id,
    p_full_name: fullName,
    p_dharma_name: body.dharmaName?.trim() || null,
    p_phone: body.phone?.trim() || null,
  });
  if (finalizeErr) {
    return new Response(JSON.stringify({ error: `账号已建但资料补全失败:${finalizeErr.message}` }), { status: 500 });
  }

  return new Response(JSON.stringify({ userId: created.user.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

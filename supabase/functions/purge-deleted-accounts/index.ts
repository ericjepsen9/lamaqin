// 账号注销·定时真删(决策078沿用 + PM 2026-07-10 裁 B1)
//
// 谁调它:pg_cron 每天定时 HTTP 敲这个端点(见迁移
//   20260710000000_account_deletion.sql 底部的手动排程说明——那两行 pg_net
//   需要 Eric 手动执行,含项目专属 URL/密钥,不写进自动迁移)。
//
// 为什么是 Edge Function 不是纯 DB 函数(CLAUDE.md §6.5:碰 auth/服务端权限→Edge):
//   删 auth.users 用 GoTrue Admin API(supabase.auth.admin.deleteUser),不是裸
//   SQL DELETE——直接 SQL 删 auth.users 会留下 auth.sessions/refresh_tokens 等
//   GoTrue 内部表的孤儿行,Admin API 会正确清干净这些。
//
// 部署(Eric 手动,App 侧无 CLI 部署权限):
//   supabase functions deploy purge-deleted-accounts
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<sss-dev 的 service_role key>
//   (SUPABASE_URL 由平台自动注入,不需要手设)
//
// 保留期天数占位·待PM/教务核实。⚠️ 三写:同一个数字还在 lib/admin-thresholds.ts:20 的
// ACCOUNT_DELETION_RETENTION_DAYS 常量、迁移 20260710000000_account_deletion.sql:25 的列注释里
// (Edge Function 跑在独立 Deno 运行时、SQL 迁移是已上库的历史记录,两者都没法直接 import
// 这份 TS 常量,三易·易迁移原则下故意不打通——改天数时这三处要一起改)。
const RETENTION_DAYS = 30;

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  // 只接受 pg_cron/受信调用,用 service_role 校验(不对公网开放业务语义,谁有这个 key 才能触发)
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: qErr } = await admin
    .from('profiles')
    .select('id, full_name, deletion_requested_at')
    .not('deletion_requested_at', 'is', null)
    .lt('deletion_requested_at', cutoff);

  if (qErr) {
    return new Response(JSON.stringify({ error: `查候选账号失败: ${qErr.message}` }), { status: 500 });
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const c of candidates ?? []) {
    try {
      // 1) 先清掉"谁审核/谁创建"这类审计字段对本人的引用——否则 auth.users 级联删 profiles 时,
      //    别人那条记录(如 confirmed_by 指向本人)会因为没设 ON DELETE 而挡住整个删除
      //    (2026-07-10 审计发现的真实约束行为,不是猜的)。
      // ⚠️ 三处都要检查各自的 error 再往下走——2026-07-11 一致性检查发现:漏检查会让这步静默失败,
      //   但第2步 deleteUser 照样执行,报出来的却是一个无关的外键错误,看不出真正病因在这里。
      const clean1 = await admin.from('practice_logs').update({ confirmed_by: null }).eq('confirmed_by', c.id);
      if (clean1.error) throw new Error(`清 practice_logs.confirmed_by 失败: ${clean1.error.message}`);
      const clean2 = await admin.from('study_records').update({ confirmed_by: null }).eq('confirmed_by', c.id);
      if (clean2.error) throw new Error(`清 study_records.confirmed_by 失败: ${clean2.error.message}`);
      const clean3 = await admin.from('study_records').update({ created_by: null }).eq('created_by', c.id);
      if (clean3.error) throw new Error(`清 study_records.created_by 失败: ${clean3.error.message}`);

      // 2) 真删——GoTrue Admin API,级联清 profiles 及其下全部关联表(practice_logs/
      //    study_records/user_practice_vows/class_members 等,均已 ON DELETE CASCADE)。
      const { error: delErr } = await admin.auth.admin.deleteUser(c.id);
      if (delErr) throw delErr;
      results.push({ id: c.id, ok: true });
      // 落 audit_logs(2026-07-11 一致性检查发现:此前每次调用的结果只活在 HTTP 响应体里,
      // 没人读就跟没发生一样,失败也不会被任何人发现)。target_id 是裸 uuid 列、无 FK,
      // 用户已被删也不影响这条审计记录本身留存。user_id(动作发起人)故意留空——这条不是
      // 哪个登录用户点出来的,是 pg_cron 定时触发,没有"谁做的"这个人;lib/queries/audit.ts
      // 的管理端审计列表页已对 user_id 为空做了兜底展示,不会因此显示异常。
      await admin.from('audit_logs').insert({
        action: 'account_purge_succeeded', target_type: 'profiles', target_id: c.id,
        metadata: { full_name: c.full_name, deletion_requested_at: c.deletion_requested_at },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ id: c.id, ok: false, error: message });
      await admin.from('audit_logs').insert({
        action: 'account_purge_failed', target_type: 'profiles', target_id: c.id,
        metadata: { full_name: c.full_name, deletion_requested_at: c.deletion_requested_at, error: message },
      });
    }
  }

  return new Response(JSON.stringify({ checked: candidates?.length ?? 0, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// 学习提醒·定时发送(决策188方案A,PM 2026-07-12三点拍板,详见
// docs/待回写中枢_2026-07-08.md D10)。
//
// 谁调它:pg_cron 每15分钟 HTTP 敲这个端点(见迁移
//   20260717000300_cohort_reminders_cron.sql 底部的手动排程说明——那两行 pg_net
//   需要 Eric 手动执行,含项目专属 URL/密钥,不写进自动迁移)。
//
// 为什么是 Edge Function 不是纯 DB 函数(CLAUDE.md §6.5:碰服务端权限/外部API→Edge):
//   要调 Expo Push API(外部 HTTP 服务),纯 SQL 做不到;且需要按每个班的
//   cohort.timezone 算"现在是不是到点了",用 Deno 的 Intl.DateTimeFormat 比在 SQL 里
//   手写时区换算更直接。
//
// 部署(Eric 手动,App 侧无 CLI 部署权限):
//   supabase functions deploy send-cohort-reminders
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<sss-dev 的 service_role key>
//   (SUPABASE_URL 由平台自动注入,不需要手设)
//
// ⚠️ 本沙盒环境无法验证真机是否真收到推送(无真机/无法收推送的模拟器,同音频下载真机
// 验证缺口同类限制,2026-07-12 讨论决策188时已明确提示过)——这个函数的逻辑已经过
// tsc/走查确认,但"Expo Push API 调用是否真的送达到设备"这一步只能等 Eric/PM 在真机验证。
//
// 默认提醒文案(决策188·App Claude拟定,PM"你来写文案,如果不合适再改"):
const DEFAULT_REMINDER_MESSAGE = '本周共修时间快到了,愿大家精进闻思,同沾法喜。';

import { createClient } from 'npm:@supabase/supabase-js@2';

type CohortRow = {
  id: string;
  name: string;
  timezone: string;
  reminder_weekday: number;
  reminder_time: string; // "HH:MM:SS"
  reminder_message: string | null;
  reminder_last_sent_date: string | null;
};

// 按cohort.timezone算"现在"对应的本地星期(0=日...6=六,同weekly_cosession_dow既有惯例)+
// "HH:MM"+当地日期(用于写回reminder_last_sent_date、跟"今天"比对防重发)。
function localNow(tz: string, at: Date): { weekday: number; hm: string; dateStr: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const WD_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = get('hour') === '24' ? '00' : get('hour'); // 部分环境午夜可能格式化成"24",归零处理
  return {
    weekday: WD_MAP[get('weekday')] ?? -1,
    hm: `${hour}:${get('minute')}`,
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

// cron每15分钟敲一次,不是精确在reminder_time那一刻——判定"当前15分钟窗口是否覆盖了
// reminder_time"(而不是要求分钟数完全相等),避免因cron实际触发时刻抖动几秒/几十秒错过窗口。
function inWindow(nowHm: string, targetHm: string): boolean {
  const toMinutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const now = toMinutes(nowHm);
  const target = toMinutes(targetHm.slice(0, 5));
  return now >= target && now < target + 15;
}

Deno.serve(async (req: Request) => {
  // 只接受 pg_cron/受信调用,用 service_role 校验(同 purge-deleted-accounts 先例)
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = new Date();

  const { data: cohorts, error: cErr } = await admin
    .from('cohorts')
    .select('id, name, timezone, reminder_weekday, reminder_time, reminder_message, reminder_last_sent_date')
    .eq('reminder_enabled', true)
    .eq('is_active', true)
    .not('reminder_weekday', 'is', null)
    .not('reminder_time', 'is', null);

  if (cErr) {
    return new Response(JSON.stringify({ error: `查班级列表失败: ${cErr.message}` }), { status: 500 });
  }

  const results: { cohortId: string; ok: boolean; sent?: number; error?: string; skipped?: string }[] = [];

  for (const cohort of (cohorts ?? []) as CohortRow[]) {
    const { weekday, hm, dateStr } = localNow(cohort.timezone, now);
    if (weekday !== cohort.reminder_weekday || !inWindow(hm, cohort.reminder_time)) continue;
    if (cohort.reminder_last_sent_date === dateStr) {
      results.push({ cohortId: cohort.id, ok: true, skipped: '今天已发过,同班同天防重发' });
      continue;
    }

    try {
      // 群发该班活跃成员(class_members.status='active')的 Expo Push token
      const { data: members, error: mErr } = await admin
        .from('class_members')
        .select('user_id')
        .eq('cohort_id', cohort.id)
        .eq('status', 'active');
      if (mErr) throw new Error(`查班级成员失败: ${mErr.message}`);
      const userIds = (members ?? []).map((m) => m.user_id as string);

      if (userIds.length === 0) {
        results.push({ cohortId: cohort.id, ok: true, sent: 0, skipped: '本班无活跃成员' });
      } else {
        const { data: tokens, error: tErr } = await admin
          .from('user_push_tokens')
          .select('expo_push_token')
          .in('user_id', userIds)
          .eq('is_active', true);
        if (tErr) throw new Error(`查推送token失败: ${tErr.message}`);

        const message = cohort.reminder_message?.trim() || DEFAULT_REMINDER_MESSAGE;
        const pushMessages = (tokens ?? []).map((t) => ({
          to: t.expo_push_token as string,
          title: `学习提醒 · ${cohort.name}`,
          body: message,
          sound: 'default',
        }));

        // Expo Push API单次最多100条(官方限制),按100一批分发
        for (let i = 0; i < pushMessages.length; i += 100) {
          const batch = pushMessages.slice(i, i + 100);
          const resp = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(batch),
          });
          if (!resp.ok) throw new Error(`Expo Push API 返回 ${resp.status}`);
        }
        results.push({ cohortId: cohort.id, ok: true, sent: pushMessages.length });
      }

      const { error: updErr } = await admin
        .from('cohorts')
        .update({ reminder_last_sent_date: dateStr })
        .eq('id', cohort.id);
      if (updErr) throw new Error(`写reminder_last_sent_date失败: ${updErr.message}`);

      await admin.from('audit_logs').insert({
        action: 'cohort_reminder_sent', target_type: 'cohorts', target_id: cohort.id,
        metadata: { cohortName: cohort.name, memberCount: userIds.length },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ cohortId: cohort.id, ok: false, error: message });
      await admin.from('audit_logs').insert({
        action: 'cohort_reminder_failed', target_type: 'cohorts', target_id: cohort.id,
        metadata: { cohortName: cohort.name, error: message },
      });
    }
  }

  return new Response(JSON.stringify({ checked: cohorts?.length ?? 0, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

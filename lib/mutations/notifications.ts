import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { NotificationCategory } from '@/lib/queries/notifications';

// 通知中心(决策062/068/170·C2·2026-07-11)。

export function useMarkNotificationRead() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', uid ?? 'anon'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count', uid ?? 'anon'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!uid) return;
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', uid ?? 'anon'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count', uid ?? 'anon'] });
    },
  });
}

// ── 写入端(普通函数,非 hook)──────────────────────────────────────────────
// 供其它 mutation(审批/转正/班级公告等)在主动作成功后顺手调用,给"别的 user"建通知
// (RLS notifications_insert 只放行 zhumai/aixin/admin,纯学员角色调不了、天然防滥发)。
// 通知是主动作的次要副作用:写入失败不抛出、不阻断主动作本身(主动作已经成功了,不该因为
// 通知这个附加功能失败而让整个操作看起来失败;仅 console.warn 留痕方便排查)。
export async function createNotification(p: {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: p.userId, category: p.category, title: p.title, body: p.body, link: p.link ?? null,
  });
  if (error) console.warn('[notifications] createNotification failed (non-blocking):', error.message);
}

// 班级公告发布时的批量版:给该班全部 active 成员各建一条(不含发布者自己——发布者不需要"收到自己发的公告")。
export async function createNotificationForCohort(p: {
  cohortId: string;
  excludeUserId?: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  const { data: members, error: mErr } = await supabase
    .from('class_members')
    .select('user_id')
    .eq('cohort_id', p.cohortId)
    .eq('status', 'active');
  if (mErr) { console.warn('[notifications] createNotificationForCohort roster read failed (non-blocking):', mErr.message); return; }
  const rows = (members ?? [])
    .map((m) => m.user_id)
    .filter((uid) => uid !== p.excludeUserId)
    .map((uid) => ({ user_id: uid, category: p.category, title: p.title, body: p.body, link: p.link ?? null }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) console.warn('[notifications] createNotificationForCohort insert failed (non-blocking):', error.message);
}

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 通知中心(决策062/068/170·C2·2026-07-11):站内收件箱,四类(学修/班级/法会/系统)
//   与 app/notifications.tsx 现有 Cat 类型逐字对应。
export type NotificationCategory = 'study' | 'class' | 'event' | 'system';
export type NotificationRow = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

// 上限200:v1 无归档/分页 UI,先用一个安全上限防止极端历史堆积一次性拉太多。
export function useMyNotifications() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['notifications', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<NotificationRow[]> => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('id, category, title, body, link, read_at, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        category: r.category as NotificationCategory,
        title: r.title,
        body: r.body,
        link: r.link,
        readAt: r.read_at,
        createdAt: r.created_at,
      }));
    },
  });
}

// 首页铃铛红点(决策170:真实未读驱动,不再恒亮)。
export function useUnreadNotificationCount() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['notifications-unread-count', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<number> => {
      if (!uid) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

import { useInfiniteQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 系统审计数据层 · 管理端「系统审计」页(只读)。audit_logs select = is_system_admin()。
// 由各处操作/触发器写入(改愿截止、判定等);"会持续累积"(页面自己文案原话),不能只看死
// 固定的前 N 条——改用 useInfiniteQuery 真分页(2026-07-11 一致性调研发现的缺口),
// 「加载更多」逐页往后翻,不再有查不到早期记录的硬顶。

export type AuditEntry = {
  id: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Page = { rows: AuditEntry[]; nextOffset: number | null };

export function useAuditLogs(pageSize = 100) {
  return useInfiniteQuery({
    queryKey: ['audit-logs', pageSize],
    staleTime: 30 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const from = pageParam;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('audit_logs')
        .select('id, user_id, action, target_type, target_id, metadata, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x)));
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        for (const p of (ps ?? []) as { id: string; full_name: string | null }[]) names.set(p.id, p.full_name ?? '');
      }
      const mapped = rows.map((r) => ({
        id: r.id,
        actorName: r.user_id ? (names.get(r.user_id) ?? null) : null,
        action: r.action,
        targetType: r.target_type ?? null,
        targetId: r.target_id ?? null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        createdAt: r.created_at ?? '',
      }));
      const nextOffset = count != null && to + 1 < count ? to + 1 : null;
      return { rows: mapped, nextOffset };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

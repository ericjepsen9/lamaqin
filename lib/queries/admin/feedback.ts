import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchAllPages } from '@/lib/queries/paginate';
import { supabase } from '@/lib/supabase';

// 后台·反馈清单(审计 P0「纠错走库」的管理侧;决策117)。
// RLS:feedback_select = 本人或 admin;feedback_update = 仅 admin(改 status)。
export type AdminFeedbackRow = {
  id: string;
  type: 'bug' | 'suggestion' | 'text_correction' | 'other';
  content: string;
  status: 'open' | 'reviewing' | 'resolved' | 'closed';
  createdAt: string | null;
  userName: string | null;
  dharmaName: string | null;
};

export function useAdminFeedback() {
  return useQuery({
    queryKey: ['admin-feedback'],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AdminFeedbackRow[]> => {
      // 分页取全(2026-07-11 一致性调研发现:原 limit(500) 硬顶,反馈积累过500条会静默漏掉更早的)。
      const data = await fetchAllPages(async (from, to) =>
        supabase
          .from('feedback')
          .select('id, type, content, status, created_at, profiles(full_name, dharma_name)')
          .order('created_at', { ascending: false })
          .range(from, to),
      );
      return ((data ?? []) as unknown as {
        id: string; type: AdminFeedbackRow['type']; content: string; status: AdminFeedbackRow['status']; created_at: string | null;
        profiles: { full_name?: string | null; dharma_name?: string | null } | null;
      }[]).map((r) => ({
        id: r.id,
        type: r.type,
        content: r.content,
        status: r.status ?? 'open',
        createdAt: r.created_at,
        userName: r.profiles?.full_name ?? null,
        dharmaName: r.profiles?.dharma_name ?? null,
      }));
    },
  });
}

export function useSetFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; status: AdminFeedbackRow['status'] }) => {
      const { error } = await supabase.from('feedback').update({ status: params.status }).eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-feedback'] }),
  });
}

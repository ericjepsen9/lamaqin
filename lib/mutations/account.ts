import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 账号注销(决策078沿用 + PM 2026-07-10 裁 B1:软删+保留期,找回仅限后台管理操作)。
// 本人申请:只标记 deletion_requested_at,不做任何数据删除;真删由 Edge Function 定时任务做
// (见 supabase/functions/purge-deleted-accounts + 迁移 20260710000000)。
export function useRequestAccountDeletion() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('request_account_deletion');
      if (error) throw error;
    },
  });
}

// 管理端撤回(账号找回):仅 admin,清空 deletion_requested_at。
export function useCancelAccountDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('cancel_account_deletion', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-students'] });
      qc.invalidateQueries({ queryKey: ['admin-student'] });
    },
  });
}

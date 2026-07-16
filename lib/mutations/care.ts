import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { FollowStatus } from '@/lib/queries/care';

// 关怀跟进写库 · 管理端 only。care_followups 写 = admin / 本班主麦 / 爱心(决策044-046)。
// 师兄完全不可见(决策035)。

export function useAddFollowup() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { userId: string; cohortId: string | null; summary: string; status: FollowStatus; clientToken?: string }) => {
      const { error } = await supabase.from('care_followups').insert({
        student_id: p.userId,
        cohort_id: p.cohortId ?? undefined,
        care_worker_id: session?.user.id ?? undefined,
        summary: p.summary.trim(),
        follow_up_status: p.status,
        contacted_at: new Date().toISOString(),
        client_token: p.clientToken ?? null,
      });
      // 弱网幂等(2026-07-13):同一凭证重复提交(网络重试/双击)当已成功处理,不当报错。
      if (error && !(error.code === '23505' && p.clientToken)) throw error;
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['care-detail', p.userId] });
      qc.invalidateQueries({ queryKey: ['care-roster'] });
    },
  });
}

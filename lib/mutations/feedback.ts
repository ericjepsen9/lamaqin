import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 反馈/纠错 写库(决策117 + 审计 P0「纠错走库」落地 2026-07-02)。
// feedback 表:type ∈ bug/suggestion/text_correction/other;RLS=本人 insert+读自己,admin 全读改。
// 法本纠错带定位:调用方把课程/节次上下文拼进 content 前缀(表无 lesson 列,不加列守 additive 克制)。
export type FeedbackType = 'bug' | 'suggestion' | 'text_correction' | 'other';

export function useSubmitFeedback() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (params: { type: FeedbackType; content: string; clientToken?: string }) => {
      if (!uid) throw new Error('未登录');
      const content = params.content.trim();
      if (!content) throw new Error('内容不能为空');
      const { error } = await supabase.from('feedback').insert({ user_id: uid, type: params.type, content, client_token: params.clientToken ?? null });
      if (error && !(error.code === '23505' && params.clientToken)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-feedback'] });
    },
  });
}

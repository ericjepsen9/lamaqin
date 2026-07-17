import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 观修座次落库(C8·2026-07-10 接线):GuanStep「完成并计时」时记一笔个人历史,
// 不接入愿状态机(见 lib/queries/meditation.ts 头注)。

export function useLogMeditationSession() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, durationMinutes, clientToken }: { lessonId: string; durationMinutes: number; clientToken?: string }) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase.from('meditation_sessions').insert({ user_id: uid, lesson_id: lessonId, duration_minutes: durationMinutes, client_token: clientToken ?? null });
      if (error && !(error.code === '23505' && clientToken)) throw error;
    },
    onSuccess: (_data, vars) => { qc.invalidateQueries({ queryKey: ['meditation-summary', uid ?? 'anon', vars.lessonId] }); },
  });
}

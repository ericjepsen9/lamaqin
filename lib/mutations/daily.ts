import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 每日发心/回向仪式书签落库(C9·2026-07-10 接线;三殊胜前行/结行·CLAUDE.md §3)。
// upsert 只带当次那一列(faxin_at 或 huixiang_at),同日另一列已有值时不会被覆盖清空。

const localToday = () => new Date().toLocaleDateString('en-CA');

export function useMarkRitual() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: 'faxin' | 'huixiang') => {
      if (!uid) throw new Error('未登录');
      const ritual_date = localToday();
      const now = new Date().toISOString();
      const { error } = kind === 'faxin'
        ? await supabase.from('daily_rituals').upsert({ user_id: uid, ritual_date, faxin_at: now }, { onConflict: 'user_id,ritual_date' })
        : await supabase.from('daily_rituals').upsert({ user_id: uid, ritual_date, huixiang_at: now }, { onConflict: 'user_id,ritual_date' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-ritual'] }),
  });
}

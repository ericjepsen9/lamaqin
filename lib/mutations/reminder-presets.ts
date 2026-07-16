import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 提醒语预设库写库。写权 = admin 或本班主麦/爱心(RLS: is_system_admin() OR my_admin_cohorts())。

function useInvalidatePresets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['reminder-presets'] });
}

export function useCreateReminderPreset() {
  const { session } = useAuth();
  const inval = useInvalidatePresets();
  return useMutation({
    mutationFn: async (p: { label: string; category: string | null; displayOrder: number; clientToken?: string }) => {
      const { error } = await supabase.from('reminder_presets').insert({
        label: p.label.trim(), category: p.category?.trim() || null,
        display_order: p.displayOrder, created_by: session?.user.id ?? undefined,
        client_token: p.clientToken ?? null,
      });
      if (error && !(error.code === '23505' && p.clientToken)) throw error;
    },
    onSuccess: inval,
  });
}

export function useUpdateReminderPreset() {
  const inval = useInvalidatePresets();
  return useMutation({
    mutationFn: async (p: { id: string; label: string; category: string | null; displayOrder: number }) => {
      const { error } = await supabase.from('reminder_presets')
        .update({ label: p.label.trim(), category: p.category?.trim() || null, display_order: p.displayOrder })
        .eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: inval,
  });
}

export function useToggleReminderPresetActive() {
  const inval = useInvalidatePresets();
  return useMutation({
    mutationFn: async (p: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('reminder_presets').update({ is_active: p.isActive }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: inval,
  });
}

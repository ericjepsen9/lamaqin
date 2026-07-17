import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 提醒语预设库(决策130/102/188)。读=任意登录;写=admin或本班主麦/爱心(见 mutations,原则3管理动作)。
// 投递方式(推送 A/B)待决策188细化,本表只管"预设文案库"本身。

export type ReminderPreset = {
  id: string;
  label: string;
  category: string | null;
  displayOrder: number;
  isActive: boolean;
  createdByName: string | null;
};

export function useReminderPresets() {
  return useQuery({
    queryKey: ['reminder-presets'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ReminderPreset[]> => {
      const { data, error } = await supabase
        .from('reminder_presets')
        .select('id, label, category, display_order, is_active, profiles(full_name)')
        .order('display_order');
      if (error) throw error;
      return ((data ?? []) as unknown as {
        id: string; label: string; category: string | null; display_order: number | null;
        is_active: boolean | null; profiles: { full_name?: string } | null;
      }[]).map((r) => ({
        id: r.id, label: r.label, category: r.category, displayOrder: r.display_order ?? 0,
        isActive: r.is_active ?? true, createdByName: r.profiles?.full_name ?? null,
      }));
    },
  });
}
